const { Router } = require('express');

const router = Router();

const axios = require('axios')

require('dotenv').config();

// Ruta para obtener todas las computadoras o filtrar por clientId y zona
router.post('/', async (req, res) => {

    try {

    const { client, devices, botusers } = req.body

    const config = {
        method: 'post',
        url: `${process.env.SIGES_SERVER}/clients`,
        data: client
      }
    
    await axios(config)

    for (let i = 0; i < devices.length; i++) {
        
        const config = {
            method: 'post',
            url: `${process.env.SIGES_SERVER}/pcs`,
            data: devices[i]
          }
        
        await axios(config)

    } 

    for (let i = 0; i < botusers.length; i++) {

        const config = {
            method: 'post',
            url: `${process.env.SIGES_SERVER}/botusers`,
            data: botusers[i]
          }
        
        await axios(config)
        
    }

    await amTeamViewer(devices)

    return res.status(201).json("Terminado")
        
    } catch (error) {

    console.error(error);
    res.status(500).json({ message: 'Error interno del servidor.' });
        
    }

});

const amTeamViewer = async (devices) => {
    try {
      const bearerToken = process.env.TEAMVIEWER_BEARER_TOKEN;
  
      const options = {
        method: 'get',
        url: 'https://webapi.teamviewer.com/api/v1/devices?full_list=true',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type': 'application/json'
        }
      };
  
      const response = await axios(options);
      const tvDevices = response.data.devices;
  
      const devicesToCreate = [];
      const devicesToUpdate = [];
  
      // Crear un conjunto (Set) de teamviewer_ids de tvDevices para facilitar la búsqueda
      const tvDevicesMap = new Map(tvDevices.map(device => [device.teamviewer_id, device.device_id]));
  
      for (const device of devices) {
        // Convertir el teamviewer_id en devices a un número entero
        const deviceTeamViewerId = parseInt(device.teamviewer_id);
  
        if (!isNaN(deviceTeamViewerId) && !tvDevicesMap.has(deviceTeamViewerId)) {
          // El dispositivo no se encuentra en tvDevices, así que lo agregamos a devicesToCreate
          devicesToCreate.push(device);
        } else {
          // El dispositivo se encuentra en tvDevices, así que lo agregamos a devicesToUpdate
          const tvDeviceId = tvDevicesMap.get(deviceTeamViewerId);
          // Agregar la propiedad device_id al dispositivo que se actualizará
          device.device_id = tvDeviceId;
          devicesToUpdate.push(device);
        }
      }

       // Realizar solicitudes axios para crear dispositivos en devicesToCreate
    for (const device of devicesToCreate) {
        const createDeviceOptions = {
          method: 'post',
          url: 'https://webapi.teamviewer.com/api/v1/devices',
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Content-Type': 'application/json'
          },
          data: {
            alias: device.tvalias,
            teamviewer_id: parseInt(device.teamviewer_id),
            remotecontrol_id: 'r' + device.teamviewer_id,
            groupid: 'g871212'
          }
        };
  
        try {
          await axios(createDeviceOptions);
        } catch (createError) {
          console.error('Error al crear el dispositivo:', createError);
        }
      }

      // Realizar solicitudes axios para actualizar dispositivos en devicesToUpdate
    for (const device of devicesToUpdate) {
        const updateDeviceOptions = {
          method: 'put',
          url: `https://webapi.teamviewer.com/api/v1/devices/${device.device_id}`,
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Content-Type': 'application/json'
          },
          data: {
            alias: device.tvalias,
          }
        };
  
        try {
          await axios(updateDeviceOptions);
        } catch (updateError) {
          console.error('Error al actualizar el dispositivo:',updateError);
        }
      }
  
  
    } catch (error) {
      console.error('Error al hacer la solicitud a TeamViewer:', error);
    }
  }
  
module.exports = router;
