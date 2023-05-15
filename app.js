require("dotenv").config();
const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')
const cors = require('cors')
const db = require("./queries")
const ml = require("./notificationMailing")
const rbacRules = require("./rbac")
const port = 3001
const tokenVal = require("./tokenValidation");
const { rejects } = require("assert");
const app = express()
var userPrivilege = -1;

app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https')
    res.redirect(`https://${req.header('host')}${req.url}`)
  else
    next()
})
app.use(cors())
app.use(bodyParser.json())
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
)


app.use(express.static(path.join(__dirname, 'build')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

//Middleware to authenticate user, get user privilege level, etc.
app.use(
  async function(request, response, next) {
    if (!request.headers.authorization) {
      console.log("Authorization token not sent")
      return response.status(401).json([]);
    }
    let res = await tokenVal.googleAuth(request.headers.authorization);
    let userEmail = res.email;
    let res2 = await db.getAppUserFromEmailLocally(userEmail);
    if (res2.rows.length == 0) {
      console.log(userEmail + " is not in the user database");
      return response.status(401).json([]);
    }
    userPrivilege = res2.rows[0].privilege_level;
    //Get the user's matching representative Id. Some users will also have a corresponding entry as representative.
    let res3 = await db.getRepresentativeFromEmailLocally(userEmail);
    let userRepresentativeId = -1;
    if(res3.rows.lenth > 0) {
      userRepresentativeId = res3.rows[0].id;
    }
    //Get current date and time of the Caracas timezone
    let today = new Date().toLocaleString("fr-CA", {timeZone: "America/Caracas"});
    //Update last_seen date of an user
    let res4 = await db.setAppUserLastSeenLocally(today, userEmail);
    next();
})

app.get('/', (request, response) => {
  response.json({ info: 'Node.js, Express, and Postgres API' })
})

//This part handles everything related to notification emails
ml.notificationMailing();

app.listen(process.env.PORT || 3001, () => {
  console.log(`App running on port ${port}.`)
})

const validatePrivilege1 = (req, res, next) => {
  console.log("Validating user privilege level 1...");
  if(userPrivilege >= 1) {
    console.log("User privilege level 1 validated");
    next()
  } else {
    res.status(403).json([]);
  }
};

const validatePrivilege2 = (req, res, next) => {
  console.log("Validating user privilege level 2...");
  if(userPrivilege >= 2) {
    console.log("User privilege level 2 validated");
    next()
  } else {
    console.log("User is not authorized for this operation");
    res.status(403).json([]);
  }
};

app.get('/api/Activities', db.getActivities);
app.post('/api/Activities', db.createActivity)
app.delete('/api/Activities', db.deleteActivity)
app.put('/api/Activities', db.updateActivity)

app.get('/api/Representatives', db.getRepresentatives)
app.post('/api/Representatives', [validatePrivilege1, db.createRepresentative])
app.delete('/api/Representatives', [validatePrivilege1, db.deleteRepresentative])
app.put('/api/Representatives', [validatePrivilege1, db.updateRepresentative])

app.get('/api/Clients', db.getClients)
app.post('/api/Clients', [validatePrivilege1, db.createClient])
app.delete('/api/Clients', [validatePrivilege1, db.deleteClient])
app.put('/api/Clients', [validatePrivilege1, db.updateClient])

app.get('/api/AppLogs', [validatePrivilege1, db.getAppLogs])
app.post('/api/AppLogs', db.createAppLog)

app.get('/api/AppUsers', [validatePrivilege2, db.getAppUsers])
app.post('/api/AppUsers', [validatePrivilege2, db.createAppUser])
app.delete('/api/AppUsers', [validatePrivilege2, db.deleteAppUser])
app.put('/api/AppUsers', [validatePrivilege2, db.updateAppUser])

app.get('/api/Contacts', db.getContacts)
app.post('/api/Contacts', [validatePrivilege1, db.createContact])
app.delete('/api/Contacts', [validatePrivilege1, db.deleteContact])
app.put('/api/Contacts', [validatePrivilege1, db.updateContact])

app.get('/api/ConfigVariables', [validatePrivilege2, db.getConfigVariables])
app.post('/api/ConfigVariables', [validatePrivilege2, db.createConfigVariable])
app.delete('/api/ConfigVariables', [validatePrivilege2, db.deleteConfigVariable])
app.put('/api/ConfigVariables', [validatePrivilege2, db.updateConfigVariable])

//Respond to login attempts
app.post('/api/LoginPriv', db.getAppUserPrivileges)


//https://blog.logrocket.com/setting-up-a-restful-api-with-node-js-and-postgresql-d96d6fc892d8/
//https://expressjs.com/es/guide/using-middleware.html