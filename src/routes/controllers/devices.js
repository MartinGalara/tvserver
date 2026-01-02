const { Router } = require("express");

const router = Router();

const axios = require("axios");

require("dotenv").config();

router.get("/", async (req, res) => {
  const accessToken = process.env.TEAMVIEWER_BEARER_TOKEN; // Obtén el token de acceso de tus variables de entorno

  // Configura las opciones de la solicitud GET a la API de TeamViewer
  const options = {
    method: "get",
    url: "https://webapi.teamviewer.com/api/v1/devices?full_list=true", // Incluye '?full_list=true' para obtener la lista completa
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };

  // Realiza la solicitud GET
  const response = await axios(options);

  // Filtra los dispositivos cuyo alias contiene 6 símbolos "|"
  const devices = response.data.devices.filter((device) => {
    const alias = device.alias || "";
    const pipeCount = (alias.match(/\|/g) || []).length;
    return pipeCount === 5;
  });

  const formattedDevices = [];

  devices.forEach((device) => {
    const aliasParts = device.alias.split("|");
    const formattedDevice = {
      razonSocial: aliasParts[0],
      bandera: setBandera(aliasParts[1]),
      identificador: aliasParts[2],
      area: aliasParts[3],
      prefijo: aliasParts[4],
      extras: aliasParts.slice(5).join("|"),
      teamviewer_id: device.teamviewer_id.toString(),
      clientId: "",
      alias: "",
    };

    formattedDevice.clientId =
      formattedDevice.bandera.substring(0, 2) + formattedDevice.identificador;

    let aliasSubString = "";
    switch (formattedDevice.area) {
      case "P":
        aliasSubString = "Playa";
      case "N":
        aliasSubString = "Nochero";
      case "R":
        aliasSubString = "Repuestos";
      case "B":
        aliasSubString = "Boxes";
      case "L":
        aliasSubString = "Lavadero";
      case "A":
        aliasSubString = "Administracion";
      case "T":
        aliasSubString = "Tienda";
      case "S":
        aliasSubString = "Server";
      case "V":
        aliasSubString = "Virtual";
      default:
        aliasSubString = "Otro";
    }

    formattedDevice.alias = aliasSubString + " | " + formattedDevice.extras;

    formattedDevices.push(formattedDevice);
  });

  for (const formattedDevice of formattedDevices) {
    const endpointUrl = `${process.env.SIGES_SERVER}/pcs?from=tv`;

    // Realiza una solicitud Axios put para enviar formattedDevice al endpoint
    await axios.put(endpointUrl, formattedDevice);
  }

  res.status(200).json({ message: "Datos procesados y enviados al endpoint" });
});

// Ruta para obtener todas las computadoras o filtrar por clientId y zona
router.post("/", async (req, res) => {
  try {
    const { client, devices, botusers, webusers } = req.body;
    const { onboarding } = req.query;

    // Validaciones de datos
    if (!client || !client.id) {
      return res.status(400).json({
        success: false,
        message: "El campo 'client' con 'id' es requerido",
      });
    }

    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return res.status(400).json({
        success: false,
        message: "El campo 'devices' debe ser un array con al menos un dispositivo",
      });
    }

    // Objeto para trackear el resultado de cada operación
    const results = {
      client: { created: false, skipped: false, error: null },
      devices: { created: 0, failed: 0, errors: [] },
      botusers: { created: 0, failed: 0, errors: [] },
      webusers: { created: 0, failed: 0, error: null },
    };

    // 1. Crear el cliente si NO viene de onboarding
    if (onboarding !== "true") {
      try {
        console.log(`[CLIENT] Creando cliente: ${client.id}`);
        const config = {
          method: "post",
          url: `${process.env.SIGES_SERVER}/clients`,
          data: client,
        };

        await axios(config);
        results.client.created = true;
        console.log(`[CLIENT] ✓ Cliente creado exitosamente: ${client.id}`);
      } catch (clientError) {
        results.client.error = clientError.response?.data || clientError.message;
        console.error(`[CLIENT] ✗ Error al crear cliente ${client.id}:`, results.client.error);

        // Si falla la creación del cliente y no es onboarding, no continuar
        return res.status(500).json({
          success: false,
          message: "Error al crear el cliente. No se continuó con el proceso.",
          results,
        });
      }
    } else {
      results.client.skipped = true;
      console.log(`[CLIENT] Cliente omitido (onboarding=true): ${client.id}`);
    }

    // 2. Crear dispositivos
    console.log(`[DEVICES] Iniciando creación de ${devices.length} dispositivos`);
    for (let i = 0; i < devices.length; i++) {
      try {
        const device = devices[i];
        console.log(
          `[DEVICES] Creando dispositivo ${i + 1}/${devices.length}: ${
            device.alias || device.teamviewer_id
          }`
        );

        const config = {
          method: "post",
          url: `${process.env.SIGES_SERVER}/pcs`,
          data: device,
        };

        await axios(config);
        results.devices.created++;
        console.log(`[DEVICES] ✓ Dispositivo creado: ${device.alias || device.teamviewer_id}`);
      } catch (deviceError) {
        results.devices.failed++;
        const errorInfo = {
          device: devices[i].alias || devices[i].teamviewer_id,
          error: deviceError.response?.data || deviceError.message,
        };
        results.devices.errors.push(errorInfo);
        console.error(`[DEVICES] ✗ Error al crear dispositivo ${i + 1}:`, errorInfo);
      }
    }

    // 3. Crear botusers
    if (botusers && Array.isArray(botusers) && botusers.length > 0) {
      console.log(`[BOTUSERS] Iniciando creación de ${botusers.length} usuarios bot`);
      for (let i = 0; i < botusers.length; i++) {
        try {
          const botuser = botusers[i];
          console.log(`[BOTUSERS] Creando botuser ${i + 1}/${botusers.length}: ${botuser.name}`);

          const config = {
            method: "post",
            url: `${process.env.SIGES_SERVER}/botusers`,
            data: botuser,
          };

          await axios(config);
          results.botusers.created++;
          console.log(`[BOTUSERS] ✓ Botuser creado: ${botuser.name}`);
        } catch (botuserError) {
          results.botusers.failed++;
          const errorInfo = {
            botuser: botusers[i].name,
            error: botuserError.response?.data || botuserError.message,
          };
          results.botusers.errors.push(errorInfo);
          console.error(`[BOTUSERS] ✗ Error al crear botuser ${i + 1}:`, errorInfo);
        }
      }
    } else {
      console.log(`[BOTUSERS] No hay botusers para crear`);
    }

    // 4. Crear webusers
    if (webusers && Array.isArray(webusers) && webusers.length > 0) {
      try {
        console.log(`[WEBUSERS] Iniciando creación de ${webusers.length} usuarios web`);

        const usersToCreate = webusers.map((webuser) => ({
          firstName: webuser.name,
          razonSocial: webuser.razonSocial,
          email: webuser.email,
          password: webuser.email,
          role: webuser.role,
          status: webuser.status,
          clientId: webuser.clientId,
          owner: webuser.owner,
        }));

        const usersConfig = {
          method: "post",
          url: `${process.env.SIGES_SERVER}/users`,
          data: {
            bulk: true,
            users: usersToCreate,
          },
        };

        await axios(usersConfig);
        results.webusers.created = usersToCreate.length;
        console.log(`[WEBUSERS] ✓ ${usersToCreate.length} usuarios web creados exitosamente`);
      } catch (usersError) {
        results.webusers.error = usersError.response?.data || usersError.message;
        console.error("[WEBUSERS] ✗ Error al crear usuarios web:", results.webusers.error);
      }
    } else {
      console.log(`[WEBUSERS] No hay webusers para crear`);
    }

    await amTeamViewer(devices);

    // Determinar si hubo errores
    const hasErrors =
      results.devices.failed > 0 || results.botusers.failed > 0 || results.webusers.error !== null;

    console.log(`[SUMMARY] Proceso completado:`, results);

    return res.status(hasErrors ? 207 : 201).json({
      success: !hasErrors,
      message: hasErrors
        ? "Proceso completado con algunos errores"
        : "Proceso completado exitosamente",
      results,
    });
  } catch (error) {
    console.error("[ERROR GENERAL]", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor.",
      error: error.message,
    });
  }
});

const amTeamViewer = async (devices) => {
  try {
    const bearerToken = process.env.TEAMVIEWER_BEARER_TOKEN;

    const options = {
      method: "get",
      url: "https://webapi.teamviewer.com/api/v1/devices?full_list=true",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
    };

    const response = await axios(options);
    const tvDevices = response.data.devices;

    const devicesToCreate = [];
    const devicesToUpdate = [];

    // Crear un conjunto (Set) de objetos de tvDevices usando teamviewer_id como clave
    const tvDevicesMap = new Map(tvDevices.map((device) => [device.teamviewer_id, device]));

    for (const device of devices) {
      // Convertir el teamviewer_id en devices a un número entero
      const deviceTeamViewerId = parseInt(device.teamviewer_id);

      if (!isNaN(deviceTeamViewerId) && !tvDevicesMap.has(deviceTeamViewerId)) {
        // El dispositivo no se encuentra en tvDevices, así que lo agregamos a devicesToCreate
        devicesToCreate.push(device);
      } else {
        // El dispositivo se encuentra en tvDevices, así que lo agregamos a devicesToUpdate
        const tvDevice = tvDevicesMap.get(deviceTeamViewerId);
        // Agregar la propiedad device_id al dispositivo que se actualizará
        device.device_id = tvDevice.device_id;
        // Agregar la propiedad aliasFromTV al dispositivo que se actualizará
        device.aliasFromTV = tvDevice.alias;
        device.descFromTV = tvDevice.description;
        devicesToUpdate.push(device);
      }
    }

    // Realizar solicitudes axios para crear dispositivos en devicesToCreate
    for (const device of devicesToCreate) {
      const createDeviceOptions = {
        method: "post",
        url: "https://webapi.teamviewer.com/api/v1/devices",
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        data: {
          alias: device.tvalias,
          teamviewer_id: parseInt(device.teamviewer_id),
          remotecontrol_id: "r" + device.teamviewer_id,
          groupid: "g871212",
        },
      };

      try {
        await axios(createDeviceOptions);
      } catch (createError) {
        console.error("Error al crear el dispositivo:", createError);
      }
    }

    // Realizar solicitudes axios para actualizar dispositivos en devicesToUpdate
    for (const device of devicesToUpdate) {
      // Verificar si tvalias contiene 5 símbolos "|"
      if (device.aliasFromTV.split("|").length === 6) {
        console.log(
          `El dispositivo con tvalias '${device.aliasFromTV}' tiene 5 símbolos "|". Se omitirá.`
        );
        continue; // Salta al siguiente dispositivo
      }

      console.log(device);

      const updateDeviceOptions = {
        method: "put",
        url: `https://webapi.teamviewer.com/api/v1/devices/${device.device_id}`,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        data: {
          alias: device.tvalias,
          description: device.descFromTV + " | " + device.aliasFromTV,
        },
      };

      try {
        await axios(updateDeviceOptions);
      } catch (updateError) {
        console.error("Error al actualizar el dispositivo:", updateError);
      }
    }
  } catch (error) {
    console.error("Error al hacer la solicitud a TeamViewer:", error);
  }
};

const setBandera = (bandera) => {
  switch (bandera.toUpperCase()) {
    case "YPF":
      return "YPF";
    case "SHE":
      return "SHELL";
    case "AXI":
      return "AXION";
    case "PUM":
      return "PUMA";
    case "GUL":
      return "GULF";
    case "REF":
      return "REFINOR";
    case "BLA":
      return "BLANCA";
    case "OTR":
      return "OTRO";

    default:
      return "OTRO";
  }
};

module.exports = router;
