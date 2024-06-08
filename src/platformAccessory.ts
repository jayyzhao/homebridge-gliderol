import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { HomebridgeGliderol } from './platform.js';

import * as fs from 'fs';

import axios, { AxiosResponse, AxiosRequestConfig, RawAxiosRequestHeaders } from 'axios';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class HomebridgeGliderolAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */

  private filePath = 'files/states.txt'

  constructor(
    private readonly platform: HomebridgeGliderol,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Gliderol')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.outletType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id);

    this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener) || this.accessory.addService(this.platform.Service.GarageDoorOpener);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
    
    const currentState = this.loadStateForId(accessory.UUID);
    this.platform.log(`Loading the cached state for ${accessory.UUID} - State ${currentState}`)


    this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .onGet(this.handleCurrentDoorStateGet.bind(this));
    
    this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
      .onGet(this.handleTargetDoorStateGet.bind(this))
      .onSet(this.handleTargetDoorStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
      .onGet(this.handleObstructionDetectedGet.bind(this));

  }

  handleCurrentDoorStateGet() {
    this.platform.log.debug('Triggered GET CurrentDoorState');
    const currentState = this.loadStateForId(this.accessory.UUID);

    return currentState;
  }
  handleTargetDoorStateGet() {
    this.platform.log.debug('Triggered GET TargetDoorState');
    const currentState = this.loadStateForId(this.accessory.UUID);

    return currentState;
  }

  async handleTargetDoorStateSet(value: any) {
    this.platform.log.debug('Triggered Set TargetDoorState');

    if(value == 0){
      // Handling the Opening of the door
      this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, 2);
      //Gliderol State 1 is Open. Homekit State 0 is Open.
      //Gliderol     HOMEKIT
      //OPEN = 1     OPEN = 0
      //CLOSED = 0   CLOSED = 1 
      if(await this.commandGliderol(1)){
        this.saveStateForId(this.accessory.UUID, 0)
        await new Promise(resolve => setTimeout(resolve, 15000));
        this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, 0);
      }
      else{
        this.saveStateForId(this.accessory.UUID, 1)
        this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, 1);
      }
      
      
    }
    else if(value == 1){
      this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, 3);
      //Gliderol State 0 is Closed. Homekit State 1 is Closed.
      if(await this.commandGliderol(0)){
        this.saveStateForId(this.accessory.UUID, 1)
        await new Promise(resolve => setTimeout(resolve, 15000));
        this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, 1);

      }
      else{
        this.saveStateForId(this.accessory.UUID, 0)
        this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, 0);
      }
      
    }
  }

  handleObstructionDetectedGet() {
    this.platform.log.debug('Triggered GET ObstructionDetected');

    // set this to a valid value for ObstructionDetected
    const currentValue = 0;

    return currentValue;
  }

  async commandGliderol(state: number){

    let data = JSON.stringify({
      "state": state
    });

    let axiosConfig = {
      method: 'post',
      url: `${this.platform.config.base_url}/prod/API/${this.platform.config.mobile_number.replace("+","")}/${this.accessory.context.device.id}/CONTROL/?appName=gliderol`,
      headers: { 
        'Authorization': this.platform.config.api_key, 
        'User-Agent': 'gliderol/1 CFNetwork/1496.0.7 Darwin/23.5.0', 
        'Content-Type': 'application/json'
      },
      data : data
    };

    var response = await axios.request(axiosConfig)

    if(response.status == 200 && response.data.ok){
      return true
    }
    else{
      this.platform.log.error(`Error talking to Gliderol....${response}`)
      return false
    }



  }

  loadStateForId(id: String) {
		try {
			const data = fs.readFileSync(this.filePath, 'utf8');
			const lines = data.split('\n');

			for (const line of lines) {
				const [fileId, value] = line.split(',').map(item => item.trim());
				if (fileId === id) {
					return value;
				}
			}

			// If ID not found, return null or any default value as needed
			return 0;
		} catch (err: any) {
			if(err.code == "ENOENT"){
				console.log("No State file exists.")
				return 0;
			}
			else{
				console.error('Error loading state for ID from file:', err);
				return 0;
			}
			
		}
	}

  ensureFileOrFolderExists(filePath: any) {
		const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));

		if (!fs.existsSync(folderPath)) {
			fs.mkdirSync(folderPath, { recursive: true });
		}

		if (!fs.existsSync(filePath)) {
			fs.writeFileSync(filePath, '', 'utf8');
		}
	}

  saveStateForId(id: String, value: Number) {
		try {
			// Ensure that the file or folder exists
			this.ensureFileOrFolderExists(this.filePath);
	
			// Read existing file content
			let data = fs.readFileSync(this.filePath, 'utf8');
			const lines = data.split('\n');
	
			// Update value for the specified ID or add it if not present
			let found = false;
			for (let i = 0; i < lines.length; i++) {
				const [fileId, _] = lines[i].split(',').map(item => item.trim());
				if (fileId === id) {
					lines[i] = `${id}, ${value}`;
					found = true;
					break;
				}
			}
			if (!found) {
				lines.push(`${id}, ${value}`);
			}
	
			// Save updated content back to the file
			data = lines.join('\n');
			fs.writeFileSync(this.filePath, data, 'utf8');
		} catch (err) {
			console.error('Error saving state for ID to file:', err);
		}
	}

}
