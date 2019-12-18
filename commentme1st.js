const fs = require("fs");
const https = require("https");
const readline = require('readline');
const querystring = require('querystring');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "CommentMe1ST > "
});
rl.on('line', (line) => {
  handleCommand(line.trim());
}).on('close', () => {
  console.log('\nExiting.');
  process.exit(0);
});


const oauthTokenRequest = {
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  host: "oauth2.googleapis.com",
  method: "POST",
  path: "/token"
}


const API_SECRETS_FILENAME = "apiSecrets.json";
const ACCOUNTS_FILENAME = "storedAccounts.json";
var SIGN_IN_URL = "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&redirect_uri=http://localhost&scope=https://www.googleapis.com/auth/youtube.force-ssl&access_type=offline&prompt=consent";

var storedAccounts = [];
var apiSecrets = {
  clientId: "",
  clientSecret: "",
  apiKey: ""
};


loadSecrets();
loadAccounts();
SIGN_IN_URL = SIGN_IN_URL.concat("&client_id=", apiSecrets.clientId);
rl.prompt();



function handleCommand(command) {
  switch (command)
  {
    case "list":
      listLoadedAccounts();
      rl.prompt();
    break;

    case "add":
      console.log("#  Adding new account to storage:");
      console.log("#");
      console.log("#  Sign in: "+SIGN_IN_URL);
      console.log("#");
      rl.question("#  Code > ", exchangeOAuthCode);
    break;

    case "refresh":
      rl.question("#  Account number > ", refreshAccount);
      break;

    case "start":
      rl.question("#  Target Channel ID > ", watch);
      break;

    case "exit":
      console.log('Exiting.');
      process.exit(0);

    default:
      console.log("Unknown command: "+command);
      rl.prompt();
    break;
  }
}

function exchangeOAuthCode(oAuthCode) {
  var responseData = [];
  var req = https.request(oauthTokenRequest, (res) => {
    console.log("#  Got: "+res.statusCode+" "+res.statusMessage);
    if (res.statusCode != 200) {
      console.log("#  Failed to exchange oAuth code for tokens!\n#");
      rl.prompt();
      return;
    }
    res.on("data", (d) => {
      responseData.push(d);
    });
    res.on("end", () => {
      nameAccount(responseData);
    });
  });
  req.on('error', (e) => {
    console.log(e);
    console.log();
  });

  var payload = querystring.stringify({
    "client_id": apiSecrets.clientId,
    "client_secret": apiSecrets.clientSecret,
    "code": oAuthCode.trim(),
    "redirect_uri": "http://localhost",
    "grant_type": "authorization_code"
  });

  req.write(payload);
  req.end();
}

function nameAccount(jsonResponse) {
  var response = JSON.parse(jsonResponse);
  var newAccount = {access_token: {token: response.access_token, aquired_at: Date.now(), expires_at: Date.now() + response.expires_in*1000}, refresh_token: response.refresh_token};

  rl.question("#  Name this account > ", (answer) => {
    newAccount.name = answer.trim();
    storedAccounts.push(newAccount);
    fs.writeFileSync(ACCOUNTS_FILENAME, JSON.stringify(storedAccounts));
    console.log("#  \x1b[32mAccount added successfully.\x1b[0m\n#");
    rl.prompt();
  });
}


function refreshAccount(index) {
  var responseData = [];
  var req = https.request(oauthTokenRequest, (res) => {
    console.log("#  Got: "+res.statusCode+" "+res.statusMessage);
    if (res.statusCode != 200) {
      console.log("#  \x1b[31mFailed to refresh account "+index+".\x1b[0m\n#");
      rl.prompt();
      return;
    }
    res.on("data", (d) => {
      responseData.push(d);
    });
    res.on("end", () => {
      storeNewToken(index, responseData);
    });
  });
  req.on('error', (e) => {
    console.log(e);
    console.log();
  });

  var payload = querystring.stringify({
    "client_id": apiSecrets.clientId,
    "client_secret": apiSecrets.clientSecret,
    "refresh_token": storedAccounts[index-1].refresh_token,
    "grant_type": "refresh_token"
  });

  req.write(payload);
  req.end();
}

function storeNewToken(index, newAccessToken) {
  var response = JSON.parse(newAccessToken);
  storedAccounts[index-1].access_token = {token: response.access_token, aquired_at: Date.now(), expires_at: Date.now() + response.expires_in*1000};
  fs.writeFileSync(ACCOUNTS_FILENAME, JSON.stringify(storedAccounts));

  console.log("#  \x1b[32mAccount "+index+" refreshed successfully.\x1b[0m\n#");
  rl.prompt();
}


function watch(channelId) {
  
}


function loadSecrets() {
  if (!fs.existsSync(API_SECRETS_FILENAME)) {
    console.log("Initializing inexisting api secrets storage.");
    fs.writeFileSync(API_SECRETS_FILENAME, JSON.stringify(apiSecrets));
    console.log("Please configure the secrets.");
    process.exit(0);
    return;
  }else{
    console.log("Loading api secrets...");
    apiSecrets = JSON.parse(fs.readFileSync(API_SECRETS_FILENAME));
    console.log("Loaded api secrets.");
  }
}

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILENAME))
  {
    console.log("Initializing inexisting accounts storage.");
    fs.writeFileSync(ACCOUNTS_FILENAME, JSON.stringify(storedAccounts));
    console.log("Loaded 0 accounts.");
  }else{
    console.log("Loading stored accounts...");
    storedAccounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILENAME));
    console.log("Loaded "+storedAccounts.length+" accounts:");
  }
}


function listLoadedAccounts() {
  if (storedAccounts.length == 0) {
    console.log("#  No accounts are loaded.");
  }else{
    console.log("#  "+storedAccounts.length+" accounts are loaded:");
    storedAccounts.forEach(element => {
      var timeRemaining = (element.access_token.expires_at - Date.now()) / 1000;
      var expired = timeRemaining <= 0;
      
      console.log("#  > #"+(storedAccounts.indexOf(element)+1)+" "+((!expired) ? "\x1b[32m" : "\x1b[31m")+element.name+"\x1b[0m - last refrshed at "+(new Date(element.access_token.aquired_at).toISOString())+", "+timeRemaining+" seconds remaining.");
    });
    console.log("#");
  }
}