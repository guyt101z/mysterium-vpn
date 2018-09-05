/*
 * Copyright (C) 2018 The "mysteriumnetwork/mysterium-vpn" Authors.
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

const fs = require('fs')

function readFeatures (path) {
  if (!fs.existsSync(path)) {
    throw new Error(`Feature file doesn't exist in "${path}"`)
  }

  try {
    return JSON.parse(fs.readFileSync(path).toString())
  } catch (e) {
    throw new Error('Unable to parse "' + path + '" feature file')
  }
}

module.exports = readFeatures
