const fs = require('node:fs');
const path = require('node:path');
const member = "auth != null && auth.token.pillboxId === 'pillbox-nhom13' && (auth.token.role === 'viewer' || auth.token.role === 'caregiver' || auth.token.role === 'admin')";
const writer = "auth != null && auth.token.pillboxId === 'pillbox-nhom13' && (auth.token.role === 'caregiver' || auth.token.role === 'admin')";
const stock = "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100 && newData.val() % 1 === 0";
const rules = { '.read': false, '.write': false,
  config: { compartments: { '.read': member, '.write': `${writer} && newData.exists()`, '.validate': "newData.hasChildren(['A','B','C'])", '$id': {
    '.validate': "($id === 'A' || $id === 'B' || $id === 'C') && newData.hasChildren(['compartmentId','medicineCode','displayName','unitsPerDose','schedule','isLoaded'])",
    compartmentId: { '.validate': 'newData.isString() && newData.val() === $id' },
    medicineCode: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 15' },
    displayName: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 31' },
    unitsPerDose: { '.validate': 'newData.isNumber() && newData.val() >= 1 && newData.val() <= 10 && newData.val() % 1 === 0' },
    schedule: { '.validate': 'newData.isString() && newData.val().matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)' },
    isLoaded: { '.validate': 'newData.isBoolean()' }, '$other': { '.validate': false }
  } } },
  inventoryCommands: {
    pending: { '.read': member, '$commandId': { '.write': `${writer} && !data.exists() && newData.exists()`,
      '.validate': "newData.hasChildren(['commandId','compartmentId','targetStock','createdAt'])",
      commandId: { '.validate': 'newData.isString() && newData.val() === $commandId && newData.val().length <= 40' },
      compartmentId: { '.validate': "newData.val() === 'A' || newData.val() === 'B' || newData.val() === 'C'" },
      targetStock: { '.validate': stock }, createdAt: { '.validate': 'newData.isNumber() && newData.val() <= now + 30000 && newData.val() >= now - 60000' },
      '$other': { '.validate': false }
    } },
    status: { '.read': member, '$id': { '.write': `${writer} && newData.child('state').val() === 'pending'`,
      '.validate': "($id === 'A' || $id === 'B' || $id === 'C') && newData.hasChildren(['commandId','compartmentId','state','targetStock','message','updatedAt'])",
      commandId: { '.validate': 'newData.isString() && newData.val().length <= 40' },
      compartmentId: { '.validate': 'newData.val() === $id' },
      state: { '.validate': "newData.val() === 'pending'" }, targetStock: { '.validate': stock },
      message: { '.validate': 'newData.isString() && newData.val().length <= 200' },
      updatedAt: { '.validate': 'newData.isNumber() && newData.val() <= now + 30000 && newData.val() >= now - 60000' },
      '$other': { '.validate': false }
    } }
  }
};
for (const key of ['deviceStatus','telemetryHistory','reportedConfig','configStatus','inventory','events','alarms','alarmEvents','notificationStatus']) rules[key] = { '.read': member, '.write': false };
rules.events['.indexOn'] = ['timestamp'];
rules.alarmEvents['.indexOn'] = ['updatedAt'];
fs.writeFileSync(path.join(__dirname, '../database.rules.json'), JSON.stringify({ rules }, null, 2) + '\n');
