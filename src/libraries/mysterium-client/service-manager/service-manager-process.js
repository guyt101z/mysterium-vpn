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

import type { ClientConfig } from '../config'
import type { LogCallback, Process } from '../index'
import type { TequilapiClient } from '../../mysterium-tequilapi/client'

class ServiceManagerProcess implements Process {
  _config: ClientConfig
  _tequilapi: TequilapiClient

  constructor (tequilapi: TequilapiClient, config: ClientConfig) {
    this._tequilapi = tequilapi
    this._config = config
  }

  async start (): Promise<void> {
  }

  async stop (): Promise<void> {
    await this._tequilapi.connectionCancel()
  }

  async setupLogging (): Promise<void> {

  }

  onLog (level: string, cb: LogCallback): void {
  }
}

export default ServiceManagerProcess
