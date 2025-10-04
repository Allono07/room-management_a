module.exports = (req, res) => {
  res.json({
    SPREADSHEET_ID: process.env.SPREADSHEET_ID,
    API_KEY: process.env.API_KEY,
    CLIENT_ID: process.env.CLIENT_ID
  });
};
