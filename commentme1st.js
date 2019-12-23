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
const commentRequest = {
  headers: { "Content-Type": "application/json" },
  host: "www.googleapis.com",
  method: "POST",
  path: "/youtube/v3/commentThreads?part=snippet"
}


const API_SECRETS_FILENAME = "apiSecrets.json";
const ACCOUNTS_FILENAME = "storedAccounts.json";
const COMMENTS_FILENAME = "storedComments.json";
var SIGN_IN_URL = "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/youtube.force-ssl&access_type=offline&prompt=consent";
var BASE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels?part=contentDetails";
var BASE_PLAYLIST_URL = "https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50";
var BASE_VIDEOS_PAGE_URL = "https://www.youtube.com/channel/"
var HTML_MATCHING_PATTERN = "href=\"/watch?v=";
var HTML_MATCH_END_CHAR = "\""

var fromHTML = false;
var channelId = "";
var uploadsPlaylistId = "";
var listDelay = -1;
var existingVideos = [];

var sotredComments = ["Gotta go fast!"];
var storedAccounts = [];
var apiSecrets = {
  clientId: "",
  clientSecret: "",
  apiKey: ""
};


loadSecrets();
loadAccounts();
loadComments();
SIGN_IN_URL = SIGN_IN_URL.concat("&client_id=", apiSecrets.clientId);
BASE_CHANNELS_URL = BASE_CHANNELS_URL.concat("&key=", apiSecrets.apiKey);
BASE_PLAYLIST_URL = BASE_PLAYLIST_URL.concat("&key=", apiSecrets.apiKey);
rl.prompt();


function handleCommand(command) {
  switch (command)
  {
    case "accounts":
      listLoadedAccounts();
      rl.prompt();
    break;

    case "comments":
      listComments();
      rl.prompt();
    break;

    case "add":
      console.log("#\n#  Adding new account to storage:");
      console.log("#");
      console.log("#  Sign in: "+SIGN_IN_URL);
      console.log("#");
      rl.question("#  Code > ", exchangeOAuthCode);
    break;

    case "refresh":
      rl.question("#\n#  Account number > ", refreshAccount);
      break;

    case "start":
      rl.question("#  How long to wait between video lookups (ms) > ", (answer) => {
        listDelay = parseInt(answer.trim());
        rl.question("#  Target Channel ID > ", (answer) => {
          channelId = answer.trim();
          rl.question("#  Use API? (y/n) > ", (answer) => {
            if (answer.trim() == "y") {
              getUploadsPlaylist(() => {
                getVideos(uploadsPlaylistId, startWatching, true);
              });
            }else{
              fromHTML = true;
              getVideosFromHTML(channelId, startWatching, true);
            }
          })
        });
      });
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

    res.on("data", (d) => {
      responseData += d;
    });
    res.on("end", () => {
      if (res.statusCode != 200) {
        console.log("#  Failed to exchange oAuth code for tokens!\n#");
        console.log("#  "+responseData);
        rl.prompt();
        return;
      }
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
    "redirect_uri": "urn:ietf:wg:oauth:2.0:oob",
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
      responseData += d;
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


function getUploadsPlaylist(callback) {
  var getUrl = BASE_CHANNELS_URL.concat("&id=", channelId);
  
  var responseData = [];
  var req = https.get(getUrl, (res) => {
    console.log("#\n#  Getting channel uploads playlist: "+res.statusCode+" "+res.statusMessage);
    if (res.statusCode != 200) {
      console.log("#\n#  Failed to get channel uploads!");
      console.log("#    "+res.statusCode+" "+res.statusMessage+"\n#");
      rl.prompt();
      return;
    }
    
    res.on("data", (d) => {
      responseData += d;
    });

    res.on("end", () => {
      if (res.statusCode != 200) {
        console.log("#\n#  Failed to get channel uploads!");
        console.log("#    "+res.statusCode+" "+res.statusMessage+"\n#");
      }

      var response = JSON.parse(responseData);
      uploadsPlaylistId = response.items[0].contentDetails.relatedPlaylists.uploads;

      console.log("#  Got "+channelId+"'s uploads playlist.\n#");
      callback();
    });
  });
  req.on("error", (e) => {
    console.log("#  Failed to search for videos!");
    console.log("#  "+e+"\n#");
    rl.prompt();
  });
}


function startWatching(playlistId, fetchedVideos) {
  existingVideos = fetchedVideos;
  console.log("#  Now waiting for new video...");

  setTimeout(() => {
    console.log("#  Fetching...");
    if (fromHTML) {
      getVideosFromHTML(playlistId, watching, false);
    }else{
      getVideos(playlistId, watching, false);
    }
  }, listDelay);
}

function watching(channelId, fetchedVideos) {
  var newVideos = [];

  fetchedVideos.forEach(element => {
    if (!existingVideos.includes(element)) {
      newVideos.push(element);
      existingVideos.push(element);
    }
  });

  if (newVideos.length == 0)
  {
    console.log("#  Waiting "+listDelay+"ms...");
    setTimeout(() => {
      console.log("#  Fetching...");
      if (fromHTML) {
        getVideosFromHTML(channelId, watching, false);
      }else{
        getVideos(playlistId, watching, false);
      }
    }, listDelay);
  }else{
    console.log("#  Found new video! ("+newVideos.length+")\n#");
    newVideos.forEach((videoId) => {
      console.log("#  Commenting on: https://www.youtube.com/watch?v="+videoId);
      storedAccounts.forEach((account, index) => {
        comment(videoId, account, index);
      });
      console.log("#");
    });
    
    console.log("#  Done commenting.\n#")
    if (fromHTML) {
      getVideosFromHTML(channelId, watching, false);
    }else{
      getVideos(playlistId, watching, false);
    }
  }
}


function comment(videoId, account, commentIndex) {
  commentRequest.headers.Authorization = "Bearer "+account.access_token.token;

  var responseData = [];
  var comment = sotredComments[commentIndex];
  var req = https.request(commentRequest, (res) => {
    console.log("#  "+account.name+" "+res.statusCode+" "+res.statusMessage);

    res.on("data", (d) => {
      responseData += d;
    });
    res.on("end", () => {
      if (res.statusCode != 200) {
        console.log("#  Failed to comment with "+account.name+"!");
        console.log("#  "+responseData);
      }else{
        console.log("#  "+comment);
      }
    });
  });
  req.on('error', (e) => {
    console.log(e);
    console.log();
  });

  var payload = JSON.stringify({
    "snippet": {
      "channelId": channelId,
      "videoId": videoId,
      "topLevelComment": {
        "snippet": {
          "textOriginal": comment
        }
      }
    }});

  req.write(payload);
  req.end();
}



function getVideos(playlistId, callback, logAll) {
  var playlistGetUrl = BASE_PLAYLIST_URL.concat("&playlistId="+playlistId);

  var videoIds = [];
  var videoDates = [];
  var responseData = [];
  var req = https.get(playlistGetUrl, (res) => {
    if (logAll) { console.log("#\n#  Listed: "+res.statusCode+" "+res.statusMessage); }
    if (res.statusCode != 200) {
      console.log("#\n#  Failed to list videos!");
      console.log("#    "+res.statusCode+" "+res.statusMessage+"\n#");
      rl.prompt();
      return;
    }
    res.on("data", (d) => {
      responseData += d;
    });
    res.on("end", () =>
    {
      var response;
      try {
        response = JSON.parse(responseData);
      }
      catch (e) {
        console.log("#  Error parsing response: "+e.message+"\n#");
        console.log(responseData+"\n#");
        rl.prompt();
        return;
      }

      response.items.forEach(element => {
        videoIds.push(element.contentDetails.videoId);
        videoDates.push(element.contentDetails.videoPublishedAt);
      });
      
      if (logAll) {
        console.log("#  Got "+videoIds.length+" latest uploads:\n#");
        videoDates.forEach((element) => {
          console.log("#    "+element);
        });
        console.log("#");
      }
      
      callback(playlistId, videoIds);
    });
  });
  req.on("error", (e) => {
    console.log("#  Failed to search for videos!");
    console.log("#  "+e+"\n#");
    rl.prompt();
  });
  
  req.end();
}

function getVideosFromHTML(channelId, callback, logAll) {
  var webpageUrl = BASE_VIDEOS_PAGE_URL.concat(channelId, "/videos");
  var videoIds = [];
  var responseData = [];

  var req = https.get(webpageUrl, (res) => {
    if (logAll) { console.log("#\n#  Listed: "+res.statusCode+" "+res.statusMessage); }
    if (res.statusCode != 200) {
      console.log("#\n#  Failed to list videos!");
      console.log("#    "+res.statusCode+" "+res.statusMessage+"\n#");
      rl.prompt();
      return;
    }
    res.on("data", (d) => {
      responseData += d;
    });
    res.on("end", () => {
      var currentMatch = [];
      var matchingIndex = 0;
      var matchingPattern = HTML_MATCHING_PATTERN;
      responseData = Array.from(responseData);
      responseData.forEach((element) =>
      {
        if (matchingIndex != matchingPattern.length) {
          if (element == matchingPattern[matchingIndex]) {
            matchingIndex++;
          }else{
            matchingIndex = 0;
          }
        }else{
          if (element != HTML_MATCH_END_CHAR) {
            currentMatch.push(element);
          }else{
            currentMatch = currentMatch.join("");
            if (!videoIds.includes(currentMatch)) {
              videoIds.push(currentMatch);
            }
            currentMatch = [];
            matchingIndex = 0;
          }
        }
      });
      
      if (logAll) {
        console.log("#  Got "+videoIds.length+" latest uploads:\n#");
        videoIds.forEach((element) => {
          console.log("#    - "+element);
        });
        console.log("#");
      }
      
      callback(channelId, videoIds);
    });
  });
  req.on("error", (e) => {
    console.log("#  Failed to search for videos!");
    console.log("#  "+e+"\n#");
    rl.prompt();
  });
  
  req.end();
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
    console.log("#\n#  No accounts are loaded.");
  }else{
    console.log("#\n#  "+storedAccounts.length+" accounts are loaded:");
    storedAccounts.forEach((element, index) => {
      var timeRemaining = (element.access_token.expires_at - Date.now()) / 1000;
      var expired = timeRemaining <= 0;
      
      console.log("#  > #"+(index+1)+" "+((!expired) ? "\x1b[32m" : "\x1b[31m")+element.name+"\x1b[0m - last refrshed at "+(new Date(element.access_token.aquired_at).toISOString())+", "+timeRemaining+" seconds remaining.");
    });
    console.log("#");
  }
}

function loadComments() {
  if (!fs.existsSync(COMMENTS_FILENAME))
  {
    console.log("Initializing inexisting comments storage.");
    fs.writeFileSync(COMMENTS_FILENAME, JSON.stringify(sotredComments));
    console.log("Loaded 1 comments.");
  }else{
    console.log("Loading stored comments...");
    sotredComments = JSON.parse(fs.readFileSync(COMMENTS_FILENAME));
    console.log("Loaded "+sotredComments.length+" comments:");
  }
}

function listComments() {
  console.log("#\n#  Loaded comments:\n#");
  sotredComments.forEach((element, index) => {
    console.log("#   #"+(index+1)+" - "+element);
  });
  console.log("#");
}