var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var app = express();
const SlackBot = require('slackbots');
var GoogleSpreadsheet = require('google-spreadsheet');
const mysql = require('mysql');
var creds = require('./client_secret.json');

const con = mysql.createConnection({
    host: "",
    user: "",
    database: "",
    password: ""
});

var vraag, opties, antwoord, fields, asked, question_id, answercorrect, explanation;

//Setup Slackbot NPM package
const bot = new SlackBot({
    //Edit your token
    token: 'xoxb-',
    name: 'Spelbot'
});

bot.on('start', () => {
    //Bot started up.
    console.log("Started")
});

//When using Ngrok with port 300 uncomment below
//const server = app.listen(300, () => {
//    console.log('Express server   listening on port %d in %s mode', server.address().port, app.settings.env);
//});


// Create a document object using the ID of the spreadsheet - obtained from its URL.
var doc = new GoogleSpreadsheet('');
var urlencodedParser = bodyParser.urlencoded({
    extended: false
});

getquestions("x", "x", true);
async function getquestions(req, res, startup) {
    doc.useServiceAccountAuth(creds, function(err) {
        // Get all of the rows from the spreadsheet.
        doc.getRows(1, function(err, rows) {
            var questionrows = rows;
            for (i = 0; i < rows.length; i++) {
                //If question isn't asked
                if (rows[i].asked == 0) {
                    questionfill(i);
                    break;
                } else if (i == rows.length - 1) {
                    console.log("No questions found");
                }
            };

        });

        function questionfill(rownumber) {
            vraag = questionrows[rownumber].question;
            opties = questionrows[rownumber].options;
            antwoord = questionrows[rownumber].answer;
            asked = questionrows[rownumber].asked;
            question_id = questionrows[rownumber].id;
            explanation = questionrows[rownumber].explanation;
            //Split options
            fields = opties.split('~');
            //Check if this is the first time this command is executed
            if (startup != true) {
                sendquestion(req, res);
            }
        }

    });

}

app.post('/send-question', urlencodedParser, (req, res) => {
    res.status(200).end() // best practice to respond with empty 200 status code
    var user_id = req.body.user_id;
    //Check is user can acces command
    if (!user_id.includes("AdminId")) {
        bot.postEphemeral("general", user_id, 'Hey! Jij mag die command niet uitvoeren!')
    } else {
        getquestions(req, res);
    }
});

function sendquestion(req, res) {
    var reqBody = req.body
    var responseURL = ""
    if (reqBody.token != "") {
        res.status(403).end("Access forbidden")
    } else {
        var message = {
            "text": "Hier komt de vraag!",
            "attachments": [{
                "text": vraag,
                "fallback": "Shame... buttons aren't supported in this land",
                "callback_id": question_id,
                "color": "#3AA3E3",
                "attachment_type": "default",
                "actions": [{
                        "name": fields[0],
                        "text": fields[0],
                        "type": "button",
                        "value": fields[0]
                    },
                    {
                        "name": fields[1],
                        "text": fields[1],
                        "type": "button",
                        "value": fields[1]
                    },
                    {
                        "name": fields[2],
                        "text": fields[2],
                        "type": "button",
                        "value": fields[2]
                    }
                ]
            }]
        }
        sendMessageToSlackResponseURL(responseURL, message)
    }
}




app.post('/leaderboard', urlencodedParser, (req, res) => {
    res.status(200).end() // best practice to respond with empty 200 status code
    var reqBody = req.body
    var user_id = req.body.user_id;
    var user_name = req.body.user_name;
    var responseURL = ""
    if (reqBody.token != "" || !user_id.includes("AdminId")) {
        res.status(403).end("Access forbidden");
        bot.postEphemeral("general", user_id, 'Hey! Jij mag die command niet uitvoeren!')
    } else {

        //Create query for leaderboard
        var queryresult = "";
        var sql = "SELECT user_id, SUM(answer) as good FROM sb_answers GROUP BY user_id ORDER BY good desc";
        con.query(sql, function(err, result) {
            if (err) throw err;
            console.log("Query succesfull");
            composemessage(result);
        });

    }
});


function composemessage(queryresult) {

    const params = {
        icon_emoji: ':trophy:',
        blocks: [{
            "type": "section",
            "text": {
                "text": "Dit is de ranglijst",
                "type": "mrkdwn"
            },
            "fields": [{
                    "type": "mrkdwn",
                    "text": "\u00A0\u00A0\u00A0*Naam*"
                },
                {
                    "type": "mrkdwn",
                    "text": "*Punten*"
                }

            ]
        }]

    }

    var userplace = 1;
    var crown = ":crown:";
    for (i = 0; i < queryresult.length - 1; i++) {
        //Make sure number 1 gets a crown
        if (userplace != 1) {
            crown = "      ";
        }
        var playername = {
            "type": "mrkdwn",
            "text": "*" + userplace + "* " + findDisplayname(queryresult[i].user_id) + " " + crown
        };
        var playerpoints = {
            "type": "mrkdwn",
            "text": "" + queryresult[i].goed + ""
        };
        userplace++;
        //Add new objects to params
        params.blocks[0].fields.push(playername);
        params.blocks[0].fields.push(playerpoints);
        if (userplace > 4) {
            break;
        }
    }
    //Post leaderboard to general channel
    bot.postMessageToChannel('general', 'Leaderboard', params);
}


// Find displayname by userId
function findDisplayname(user_id) {
    var user_displayname;
    const members = bot.getUsers()._value.members;
    members.forEach(function(member) {
        var userId = member.id;
        if (userId.includes(user_id)) {
            user_displayname = member.profile.display_name;
        }
    });
    //Return the displayname
    return user_displayname;
}




function sendMessageToSlackResponseURL(responseURL, JSONmessage) {
    var postOptions = {
        uri: responseURL,
        method: 'POST',
        headers: {
            'Content-type': 'application/json'
        },
        json: JSONmessage
    }
    request(postOptions, (error, response, body) => {
        if (error) {
            console.log(error);
        }
    })
}




app.post('/slack/actions', urlencodedParser, (req, res) => {
    res.status(200).end() // best practice to respond with 200 status
    var actionJSONPayload = JSON.parse(req.body.payload) // parse URL-encoded payload JSON string


    alreadyaskedcheck();
    async function alreadyaskedcheck() {
        asked = checkifquestionasked(actionJSONPayload.callback_id);
        if (asked) {
            var message = {
                //Question not answerable
                "text": 'Woops! Deze vraag is niet meer te beantwoorden :(',
                "replace_original": false
            }
            sendMessageToSlackResponseURL(actionJSONPayload.response_url, message);
        }
    }

    //Get user_id of user interacting.
    var user_id = actionJSONPayload.user.id;

    checkifanswered();
    async function checkifanswered() {
        await alreadyaskedcheck();
        if (!asked) {
            var sql = "SELECT * FROM sb_answers WHERE question_id = " + question_id + " AND user_id = '" + user_id + "'";
            con.query(sql, function(err, result) {
                if (err) throw err;
                if (result != "") {
                    var message = {
                        //Question is already answered by user
                        "text": "Deze vraag heb je al eens beantwoord :wink:",
                        "replace_original": false
                    }
                    sendMessageToSlackResponseURL(actionJSONPayload.response_url, message)

                } else {
                    //Not yet answered, so save to database
                    saveanswer(actionJSONPayload);
                }
            });
        }
    }
});

function saveanswer(actionJSONPayload) {
    let answercolor;
    //If answer is correct
    if (actionJSONPayload.actions[0].name == antwoord) {
        answercontrol = "Gefeliciteerd, je hebt juist geantwoord! :muscle:";
        answercorrect = 1;
        answercolor = "#1E7E34";
    } else {
        //Answer is incorrect
        answercontrol = "Helaas, je hebt niet juist geantwoord. :cry:";
        answercorrect = 0;
        answercolor = "#BD2130";
    }
    //Compose answer
    var message = {
        "text": answercontrol,
        "replace_original": false,
        "attachments": [{
            "text": explanation,
            "fallback": "Jammer... deze vraag is niet meer mogelijk te beantwoorden.",
            "color": answercolor,
            "attachment_type": "default"

        }]
    }
    //Save answer to database.
    var sql = "INSERT INTO sb_answers (question_id, user_id, answer) VALUES ('" + question_id + "', '" + user_id + "', '" + answercorrect + "')";
    con.query(sql, function(err, result) {
        if (err) throw err;
        console.log("1 record inserted");
    });
    //Reply answer
    sendMessageToSlackResponseURL(actionJSONPayload.response_url, message)
}

function checkifquestionasked(qid) {
    if (questionrows[qid - 1].asked == 1) {
        return true;
    } else {
        return false;
    }
}