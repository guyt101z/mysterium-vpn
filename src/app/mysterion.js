/*
 * Copyright (C) 2017 The "MysteriumNetwork/mysterion" Authors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// @flow

import { app, BrowserWindow } from 'electron'
import trayFactory from '../main/tray/factory'
import { Installer, logLevels as processLogLevels } from '../libraries/mysterium-client'
import { SUDO_PROMT_PERMISSION_DENIED } from '../libraries/mysterium-client/launch-daemon/installer'
import translations from './messages'
import MainMessageBusCommunication from './communication/main-message-bus-communication'
import MainMessageBus from './communication/mainMessageBus'
import { onFirstEvent, onFirstEventOrTimeout } from './communication/utils'
import path from 'path'
import ConnectionStatusEnum from '../libraries/mysterium-tequilapi/dto/connection-status-enum'
import logger from './logger'
import type { Size } from './window'
import type { MysterionConfig } from './mysterionConfig'
import Window from './window'
import Terms from './terms'
import ProcessMonitoring from '../libraries/mysterium-client/monitoring'
import ProposalFetcher from './data-fetchers/proposal-fetcher'
import type { BugReporter } from './bug-reporting/interface'
import { UserSettingsStore } from './user-settings/user-settings-store'
import Notification from './notification'
import type { MessageBus } from './communication/messageBus'
import type { MainCommunication } from './communication/main-communication'
import IdentityDTO from '../libraries/mysterium-tequilapi/dto/identity'
import type { CurrentIdentityChangeDTO } from './communication/dto'

type MysterionParams = {
  browserWindowFactory: () => BrowserWindow,
  windowFactory: () => Window,
  config: MysterionConfig,
  terms: Terms,
  installer: Installer,
  monitoring: ProcessMonitoring,
  process: Object,
  proposalFetcher: ProposalFetcher,
  bugReporter: BugReporter,
  userSettingsStore: UserSettingsStore,
  disconnectNotification: Notification
}

const LOG_PREFIX = '[Mysterion] '
const MYSTERIUM_CLIENT_STARTUP_THRESHOLD = 10000

class Mysterion {
  browserWindowFactory: () => BrowserWindow
  windowFactory: Function
  config: MysterionConfig
  terms: Terms
  installer: Installer
  monitoring: ProcessMonitoring
  process: Object
  proposalFetcher: ProposalFetcher
  bugReporter: BugReporter
  userSettingsStore: UserSettingsStore
  disconnectNotification: Notification

  window: Window
  messageBus: MessageBus
  communication: MainCommunication

  constructor (params: MysterionParams) {
    this.browserWindowFactory = params.browserWindowFactory
    this.windowFactory = params.windowFactory
    this.config = params.config
    this.terms = params.terms
    this.installer = params.installer
    this.monitoring = params.monitoring
    this.process = params.process
    this.proposalFetcher = params.proposalFetcher
    this.bugReporter = params.bugReporter
    this.userSettingsStore = params.userSettingsStore
    this.disconnectNotification = params.disconnectNotification
  }

  run () {
    this.logUnhandledRejections()

    // fired when app has been launched
    app.on('ready', async () => {
      try {
        logInfo('Application launch')
        await this.bootstrap()
        this._buildTray()
      } catch (e) {
        logException('Application launch failed', e)
        this.bugReporter.captureErrorException(e)
      }
    })
    // fired when all windows are closed
    app.on('window-all-closed', () => this.onWindowsClosed())
    // fired just before quitting, this should quit
    app.on('will-quit', () => this.onWillQuit())
    // fired when app activated
    app.on('activate', () => {
      try {
        logInfo('Application activation')
        if (!this.window.exists()) {
          this.bootstrap()
          return
        }
        this.window.show()
      } catch (e) {
        logException('Application activation failed', e)
        this.bugReporter.captureErrorException(e)
      }
    })
    app.on('before-quit', () => {
      this.window.willQuitApp = true
    })
  }

  logUnhandledRejections () {
    process.on('unhandledRejection', error => {
      logger.info('Received unhandled rejection:', error)
    })
  }

  async bootstrap () {
    const showTerms = !this._areTermsAccepted()
    const browserWindow = this._createBrowserWindow()
    const windowSize = this._getWindowSize(showTerms)
    this.window = this._createWindow(windowSize)

    const send = this._getSendFunction(browserWindow)
    this.messageBus = new MainMessageBus(send, this.bugReporter.captureErrorException)
    this.communication = new MainMessageBusCommunication(this.messageBus)
    this.communication.onCurrentIdentityChange((identityChange: CurrentIdentityChangeDTO) => {
      const identity = new IdentityDTO({id: identityChange.id})
      this.bugReporter.setUser(identity)
    })

    await this._onRendererLoaded()

    if (showTerms) {
      const accepted = await this._acceptTermsOrQuit()
      if (!accepted) {
        return
      }
      this.window.resize(this._getWindowSize(false))
    }

    await this._ensureDaemonInstallation()
    this._startProcess()
    this._startProcessMonitoring()
    this._onProcessReady(() => {
      logInfo(`Notify that 'mysterium_client' process is ready`)
      this.communication.sendMysteriumClientIsReady()
    })

    this._subscribeProposals()

    synchronizeUserSettings(this.userSettingsStore, this.communication)
    showNotificationOnDisconnect(this.userSettingsStore, this.communication, this.disconnectNotification)
    await this._loadUserSettings()
  }

  _getWindowSize (showTerms: boolean) {
    if (showTerms) {
      return this.config.windows.terms
    } else {
      return this.config.windows.app
    }
  }

  _areTermsAccepted (): boolean {
    logInfo('Checking terms cache')
    try {
      this.terms.load()
      return this.terms.isAccepted()
    } catch (e) {
      this.bugReporter.captureErrorException(e)
      return false
    }
  }

  _getSendFunction (browserWindow: BrowserWindow) {
    return browserWindow.webContents.send.bind(browserWindow.webContents)
  }

  _createBrowserWindow () {
    try {
      return this.browserWindowFactory()
    } catch (e) {
      // TODO: add an error wrapper method
      throw new Error('Failed to open browser window. ' + e)
    }
  }

  _createWindow (size: Size) {
    logInfo('Opening window')
    try {
      const window = this.windowFactory()
      window.resize(size)
      window.open()
      return window
    } catch (e) {
      // TODO: add an error wrapper method
      throw new Error('Failed to open window. ' + e)
    }
  }

  async _onRendererLoaded () {
    logInfo('Waiting for window to be rendered')
    try {
      await onFirstEvent(this.communication.onRendererBooted.bind(this.communication))
    } catch (e) {
      // TODO: add an error wrapper method
      throw new Error('Failed to load app. ' + e)
    }
  }

  // checks if daemon is installed or daemon file is expired
  // if the installation fails, it sends a message to the renderer window
  async _ensureDaemonInstallation () {
    if (this.installer.needsInstallation()) {
      logInfo("Installing 'mysterium_client' process")
      try {
        await this.installer.install()
      } catch (e) {
        let messageForUser = translations.processInstallationError
        if (e.message === SUDO_PROMT_PERMISSION_DENIED) {
          messageForUser = translations.processInstallationPermissionsError
        }
        this.communication.sendRendererShowErrorMessage(messageForUser)
        throw new Error("Failed to install 'mysterium_client' process. " + e)
      }
    }
  }

  async _loadUserSettings () {
    try {
      await this.userSettingsStore.load()
    } catch (e) {
      this.bugReporter.captureInfoException(e)
    }
  }

  onWindowsClosed () {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  }

  async onWillQuit () {
    this.monitoring.stop()
    this.proposalFetcher.stop()

    try {
      await this.process.stop()
    } catch (e) {
      logException("Failed to stop 'mysterium_client' process", e)
      this.bugReporter.captureErrorException(e)
    }
  }

  // make sure terms are up to date and accepted
  // declining terms will quit the app
  async _acceptTermsOrQuit () {
    logInfo('Accepting terms')
    try {
      const accepted = await this._acceptTerms()
      if (!accepted) {
        logInfo('Terms were refused. Quitting.')
        app.quit()
        return false
      }
    } catch (e) {
      this.communication.sendRendererShowErrorMessage(e.message)
      throw new Error('Failed to accept terms. ' + e)
    }
    return true
  }

  async _acceptTerms () {
    this.communication.sendTermsRequest({
      htmlContent: this.terms.getContent()
    })

    const termsAnsweredDTO = await onFirstEvent((callback) => {
      this.communication.onTermsAnswered(callback)
    })
    const termsAnswer = termsAnsweredDTO.isAccepted
    if (!termsAnswer) {
      return false
    }

    this.communication.sendTermsAccepted()

    try {
      this.terms.accept()
    } catch (e) {
      const error = new Error(translations.termsAcceptError)
      const errorObj = (error: Object)
      errorObj.original = e
      throw error
    }
    return true
  }

  _startProcess () {
    const cacheLogs = (level, data) => {
      this.communication.sendMysteriumClientLog({level, data})
      this.bugReporter.pushToLogCache(level, data)
    }

    logInfo("Starting 'mysterium_client' process")
    this.process.start()
    try {
      this.process.setupLogging()
      this.process.onLog(processLogLevels.INFO, (data) => cacheLogs(processLogLevels.INFO, data))
      this.process.onLog(processLogLevels.ERROR, (data) => cacheLogs(processLogLevels.ERROR, data))
    } catch (e) {
      logger.error('Failing to process logs. ', e)
      this.bugReporter.captureErrorException(e)
    }
  }

  _startProcessMonitoring () {
    this.monitoring.onStatusUp(() => {
      logInfo("'mysterium_client' is up")
      this.communication.sendMysteriumClientUp()
    })
    this.monitoring.onStatusDown(() => {
      logInfo("'mysterium_client' is down")
      this.communication.sendMysteriumClientDown()
    })
    this.monitoring.onStatus((status) => {
      if (status === false) {
        logInfo("Starting 'mysterium_client' process, because it's currently down")
        this.process.start()
      }
    })

    logInfo("Starting 'mysterium_client' monitoring")
    this.monitoring.start()
  }

  _onProcessReady (callback: () => void) {
    onFirstEventOrTimeout(this.monitoring.onStatusUp.bind(this.monitoring), MYSTERIUM_CLIENT_STARTUP_THRESHOLD)
      .then(callback)
      .catch(err => {
        this.communication.sendRendererShowErrorMessage(translations.processStartError)
        logException("Failed to start 'mysterium_client' process", err)
      })
  }

  _subscribeProposals () {
    this.proposalFetcher.onFetchedProposals((proposals) => this.communication.sendProposals(proposals))
    this.communication.onProposalUpdateRequest(() => {
      this.proposalFetcher.fetch()
    })
    this.proposalFetcher.onFetchingError((error: Error) => {
      logException('Proposal fetching failed', error)
      this.bugReporter.captureErrorException(error)
    })

    this.monitoring.onStatusUp(() => {
      logInfo('Starting proposal fetcher')
      this.proposalFetcher.start()
    })
    this.monitoring.onStatusDown(() => this.proposalFetcher.stop())
  }

  _buildTray () {
    logInfo('Building tray')
    trayFactory(
      this.communication,
      this.proposalFetcher,
      this.window,
      path.join(this.config.staticDirectory, 'icons')
    )
  }
}

function showNotificationOnDisconnect (userSettingsStore, communication, disconnectNotification) {
  communication.onConnectionStatusChange((status) => {
    const shouldShowNotification =
      userSettingsStore.get().showDisconnectNotifications &&
      (status.newStatus === ConnectionStatusEnum.NOT_CONNECTED &&
        status.oldStatus === ConnectionStatusEnum.CONNECTED)

    if (shouldShowNotification) {
      disconnectNotification.show()
    }
  })
}

function synchronizeUserSettings (userSettingsStore, communication) {
  communication.onUserSettingsRequest(() => {
    communication.sendUserSettings(userSettingsStore.get())
  })

  communication.onUserSettingsUpdate((userSettings) => {
    userSettingsStore.set(userSettings)
    userSettingsStore.save()
  })
}

function logInfo (message: string) {
  logger.info(LOG_PREFIX + message)
}

function logException (message: string, err: Error) {
  logger.error(LOG_PREFIX + message, err)
}

export default Mysterion
