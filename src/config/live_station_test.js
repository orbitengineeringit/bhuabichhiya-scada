import mqtt from 'mqtt';

const brokerUrl = 'mqtt://broker.hivemq.com:1883';
const topics = [
  'Orbit/BICHIYA/INTAKE/0000000001',
  'Orbit/BICHIYA/WTP/0000000001',
  'Orbit/BICHIYA/OHT01/0000000001',
  'Orbit/BICHIYA/OHT02/0000000001',
  'Orbit/BICHIYA/OHT03/0000000001'
];

console.log("Connecting to HiveMQ...");
const client = mqtt.connect(brokerUrl);

const stats = {
  INTAKE: { count: 0, validTelemetry: 0, spamCount: 0, samples: [] },
  WTP: { count: 0, validTelemetry: 0, spamCount: 0, samples: [] },
  OHT01: { count: 0, validTelemetry: 0, spamCount: 0, samples: [] },
  OHT02: { count: 0, validTelemetry: 0, spamCount: 0, samples: [] },
  OHT03: { count: 0, validTelemetry: 0, spamCount: 0, samples: [] },
};

client.on('connect', () => {
  console.log("Connected. Subscribing to 5 plant topics...");
  client.subscribe(topics, (err) => {
    if (err) console.error("Subscribe error:", err);
    else console.log("Subscribed successfully! Listening for 45 seconds...");
  });

  setTimeout(() => {
    console.log("\n================ LIVE MQTT REPORT (CURRENT STATUS: TODAY 23-SEP-2026) ================");
    for (const [station, st] of Object.entries(stats)) {
      console.log(`\nStation [${station}]:`);
      console.log(`  Total Messages: ${st.count}`);
      console.log(`  Valid Telemetry: ${st.validTelemetry}`);
      console.log(`  Spam/Non-telemetry: ${st.spamCount}`);
      console.log(`  Telemetry Sample:`, st.samples.slice(0, 3));
      if (st.validTelemetry > 0) {
        console.log(`  STATUS: ONLINE & TRANSMITTING DATA`);
      } else if (st.count > 0) {
        console.log(`  STATUS: OFFLINE (SIM/RTU not sending sensor data; rogue messages detected)`);
      } else {
        console.log(`  STATUS: COMPLETELY OFFLINE (No packets received)`);
      }
    }
    client.end();
    process.exit(0);
  }, 45000);
});

client.on('message', (topic, payload) => {
  const str = payload.toString();
  let station = 'UNKNOWN';
  if (topic.includes('INTAKE')) station = 'INTAKE';
  else if (topic.includes('WTP')) station = 'WTP';
  else if (topic.includes('OHT01')) station = 'OHT01';
  else if (topic.includes('OHT02')) station = 'OHT02';
  else if (topic.includes('OHT03')) station = 'OHT03';

  if (!stats[station]) return;
  stats[station].count++;

  try {
    const json = JSON.parse(str);
    let isNumeric = false;
    const targetObj = json.equipment_data && typeof json.equipment_data === 'object' ? json.equipment_data : json;
    if (targetObj.VALUE !== undefined && !isNaN(Number(targetObj.VALUE))) {
      isNumeric = true;
    } else {
      for (const [k, v] of Object.entries(targetObj)) {
        if (!isNaN(Number(v))) { isNumeric = true; break; }
      }
    }

    if (isNumeric) {
      stats[station].validTelemetry++;
      if (stats[station].samples.length < 5) {
        stats[station].samples.push({ ts: new Date().toLocaleTimeString(), payload: json });
      }
    } else {
      stats[station].spamCount++;
    }
  } catch {
    stats[station].spamCount++;
  }
});
