import {spawn} from 'child_process'

class Process {
  constructor (config, tequilapi) {
    this.config = config
  }

  start () {
    this.child = spawn(this.config.clientBin, [
      '--config-dir', this.config.configDir,
      '--runtime-dir', this.config.runtimeDir
    ])
  }

  stop () {
    this.child.kill('SIGTERM')
  }
}

export default Process
