<!--
  - Copyright (C) 2017 The "mysteriumnetwork/mysterium-vpn" Authors.
  -
  - This program is free software: you can redistribute it and/or modify
  - it under the terms of the GNU General Public License as published by
  - the Free Software Foundation, either version 3 of the License, or
  - (at your option) any later version.
  -
  - This program is distributed in the hope that it will be useful,
  - but WITHOUT ANY WARRANTY; without even the implied warranty of
  - MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  - GNU General Public License for more details.
  -
  - You should have received a copy of the GNU General Public License
  - along with this program.  If not, see <http://www.gnu.org/licenses/>.
  -->

<template>
  <div
    class="nav"
    :class="{'is-open':navOpen}">
    <div class="nav__content">
      <div class="nav__content-top">
        <div
          class="nav__navicon"
          @click="switchNav(!navOpen)">
          <div class="nav__burger burger">
            <i class="burger__bar burger__bar--1"/>
            <i class="burger__bar burger__bar--2"/>
            <i class="burger__bar burger__bar--3"/>
          </div>
        </div>
        <nav-list>
          <a
            slot="item"
            class="nav__trigger"
            href="#"
            @click="openRemoteLink('https://mysterium.network/')">
            <icon-eye class="nav__icon nav__icon--eye"/>
            <span class="nav__text">about</span>
          </a>
          <a
            slot="item"
            class="nav__trigger"
            href="#"
            @click="openRemoteLink('https://mysterium.typeform.com/to/gP2jAk')">
            <icon-lightbulb class="nav__icon nav__icon--eye"/>
            <span class="nav__text">suggest feature</span>
          </a>
          <a
            slot="item"
            class="nav__trigger"
            href="#"
            @click="reportIssue">
            <icon-issue class="nav__icon nav__icon--issue"/>
            <span class="nav__text">report issue</span>
          </a>
        </nav-list>

        <div class="nav__settings">
          <disconnect-notification-settings/>
        </div>
      </div>

      <div class="nav__content-bottom">
        <div class="control__version">{{ version }}</div>
        <div class="nav__logout">
          <a
            class="nav__trigger"
            href="#"
            @click="quit()">
            <icon-quit class="nav__icon nav__icon--quit"/>
            <span class="nav__text">quit</span>
          </a>
        </div>
      </div>
    </div>
    <transition name="fade">
      <div
        v-if="navOpen"
        class="nav__backdrop"
        @click="switchNav(false)"/>
    </transition>
  </div>
</template>

<script>
import { remote, shell } from 'electron'
import { mapGetters, mapActions } from 'vuex'
import IconIssue from '@/assets/img/icon--issue.svg'
import IconEye from '@/assets/img/icon--eye.svg'
import IconQuit from '@/assets/img/icon--quit.svg'
import IconLightbulb from '@/assets/img/icon--lightbulb.svg'
import DisconnectNotificationSettings from '@/components/disconnect-notification-setting'
import NavList from '../components/nav-list'
import { getVersionLabel } from '../../libraries/version'

export default {
  name: 'AppNav',
  dependencies: ['mysteriumVpnReleaseID', 'feedbackForm'],
  components: {
    IconEye,
    IconIssue,
    IconQuit,
    IconLightbulb,
    DisconnectNotificationSettings,
    NavList
  },
  computed: {
    // mix the getters into computed with object spread operator
    ...mapGetters(['navOpen', 'clientVersion']),
    version () {
      return getVersionLabel(this.mysteriumVpnReleaseID, this.clientVersion)
    }
  },
  methods: {
    ...mapActions(['switchNav']),
    quit () {
      remote.app.quit()
    },
    openRemoteLink (url) {
      shell.openExternal(url)
    },
    reportIssue () {
      this.feedbackForm.show()
    }
  }
}
</script>
