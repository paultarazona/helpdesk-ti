const path = require('node:path');
const cors = require('cors');
const express = require('express');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// [VULN-012][A05:Security-Misconfiguration][CWE-942] v1 accepts every origin.
app.use(cors({ origin: '*' }));

app.get('/', (_request, response) => {
  response.render('home');
});

// [VULN-012][A05:Security-Misconfiguration][CWE-209] v1 exposes error details to the client.
app.use((error, _request, response, _next) => {
  response.status(500).type('text').send(error.stack);
});

module.exports = app;
