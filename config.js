// config.js
const CONFIG = {
  SPREADSHEET_ID: window.env.SPREADSHEET_ID,
  API_KEY: window.env.API_KEY,
  CLIENT_ID: window.env.CLIENT_ID,
  DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
  WASTE_SHEET: 'Waste!A:E',
  WATER_SHEET: 'Water!A:E', 
  CLEANING_SHEET: 'Cleaning!A:E',
  ROOMMATES: ['ALLEN', 'DEBIN', 'GREEN', 'JITHU']
};
