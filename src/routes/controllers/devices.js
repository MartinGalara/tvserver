const { Router } = require('express');

const router = Router();

const axios = require('axios')

require('dotenv').config();

router.get('/', async (req, res) => {

  const accessToken = process.env.TEAMVIEWER_BEARER_TOKEN; // Obtén el token de acceso de tus variables de entorno

    // Configura las opciones de la solicitud GET a la API de TeamViewer
    const options = {
      method: 'get',
      url: 'https://webapi.teamviewer.com/api/v1/devices?full_list=true', // Incluye '?full_list=true' para obtener la lista completa
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    // Realiza la solicitud GET
    const response = await axios(options);

      // Filtra los dispositivos cuyo alias contiene 6 símbolos "|"
      const devices = response.data.devices.filter(device => {
        const alias = device.alias || '';
        const pipeCount = (alias.match(/\|/g) || []).length;
        return pipeCount === 6;
      });

    const formattedDevices = [];

      devices.forEach(device => {
        const aliasParts = device.alias.split('|');
        const formattedDevice = {
          razonSocial: aliasParts[0],
          bandera: setBandera(aliasParts[1]),
          identificador: aliasParts[2],
          ciudad: aliasParts[3],
          area: aliasParts[4],
          prefijo: aliasParts[5],
          extras: aliasParts.slice(6).join('|'),
          teamviewer_id: device.teamviewer_id.toString(),
          clientId:"",
          alias:""
        };

        formattedDevice.clientId = formattedDevice.bandera.substring(0, 2) + formattedDevice.identificador;
        formattedDevice.alias = formattedDevice.area + formattedDevice.teamviewer_id.toString()

        formattedDevices.push(formattedDevice);
      });

       for (const formattedDevice of formattedDevices) {
        const endpointUrl = `${process.env.SIGES_SERVER}/pcs?from=tv`;

        // Realiza una solicitud Axios put para enviar formattedDevice al endpoint
        await axios.put(endpointUrl, formattedDevice);

      }

      res.status(200).json({ message: 'Datos procesados y enviados al endpoint' });

      
});

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
        // Verificar si tvalias contiene 6 símbolos "|"
        if (device.tvalias.split('|').length === 7) {
          console.log(`El dispositivo con tvalias '${device.tvalias}' tiene 6 símbolos "|". Se omitirá.`);
          continue; // Salta al siguiente dispositivo
        }
      
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
          console.error('Error al actualizar el dispositivo:', updateError);
        }
      }

    } catch (error) {
      console.error('Error al hacer la solicitud a TeamViewer:', error);
    }
  }

  const setBandera = (bandera) => {

    switch (bandera.toUpperCase()) {
      case "YPF": 
          return "YPF"
      case "SHE": 
          return "SHELL"
      case "AXI": 
          return "AXION"
      case "PUM": 
          return "PUMA"
      case "GUL": 
          return "GULF"
      case "REF": 
          return "REFINOR"
      case "BLA": 
          return "BLANCA"
      case "OTR": 
          return "OTRO"
     
      default:
          return "OTRO"
     }

  }
  
module.exports = router;
