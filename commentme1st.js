const fs = require("fs");

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "CommentMe1ST > "
});
rl.on('line', (line) => {
  handleCommand(line.trim());
  rl.prompt();
}).on('close', () => {
  console.log('\nExiting.');
  process.exit(0);
});


const TOKENS_FILENAME = "storedAccounts.json";
const SIGN_IN_URL = "https://";

var storedAccounts = [];


loadAccounts();
rl.prompt();

function handleCommand(command) {
  switch (command)
  {
    case "list":
      listLoadedAccounts();
    break;

    case "add":
      console.log("# Adding new account to storage:");
      console.log("#");
      console.log("# Sign in: ");
    break;

    case "exit":
      console.log('Exiting.');
      process.exit(0);
    break;

    default:
      console.log("Unknown command: "+command);
    break;
  }
}



function loadAccounts() {
  if (!fs.existsSync(TOKENS_FILENAME))
  {
    console.log("Initializing inexisting storage.");
    fs.writeFileSync(TOKENS_FILENAME, JSON.stringify(storedAccounts));
    console.log("Loaded 0 accounts.");
  }else{
    console.log("Loading stored accounts...");
    storedAccounts = JSON.parse(fs.readFileSync(TOKENS_FILENAME));
    console.log("Loaded "+storedAccounts.length+" accounts:");
  }
}


function listLoadedAccounts() {
  if (storedAccounts.length == 0) {
    console.log("No accounts are loaded.");
  }else{
    console.log(storedAccounts.length+" accounts are loaded:");
    storedAccounts.forEach(element => {
      var timeRemaining = (element.access_token.expires_at - Date.now()) / 1000;
      var expired = timeRemaining <= 0;
      
      console.log(" > "+((!expired) ? "\x1b[32m" : "\x1b[31m")+element.name+"\x1b[0m - last refrshed at "+(new Date(element.access_token.aquired_at).toLocaleDateString()+", "+timeRemaining+" seconds remaining."));
    });
  }
}