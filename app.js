require('dotenv').config();
var sqlite3 = require('sqlite3').verbose();
var fs = require("fs");
var file = "local.db";
var exists = fs.existsSync(file);
var db = new sqlite3.Database('local.db');
var slackAPI = require('slackbotapi');
var slack = new slackAPI({
    'token': process.env.SLACK_TOKEN,
    'logging': true,
    'autoReconnect': true
});

db.serialize(function() {
	if(!exists) {
		var group_arr = ["dev", "sponsorship"];
		db.run("CREATE TABLE groups (id	INTEGER PRIMARY KEY AUTOINCREMENT, name	TEXT)");
		db.run("CREATE TABLE members (groupid INTEGER, username	TEXT)");
		db.run("BEGIN TRANSACTION");
		group_arr.forEach(function(group) {
			db.run("INSERT INTO groups (name) VALUES (?)", [group]);
		 });
    	db.run("END");
	}
});

// Slack on EVENT message, send data.
slack.on('message', function (data) {
    // If no text, return.
    if (typeof data.text === 'undefined') return;

    var text = data.text.split(' ');
    if(text[0] === 'boilerbot') {
    	if(text[1] === 'group') {
    		if(text[2] === 'list') {
    			var i = 1;
    			db.each("SELECT * FROM groups", function(err, row) {
    				 slack.sendMsg(data.channel, '#' + i + ' ' + row.name);
    				 i++;
  				});
    		}
    		else if(text[2] === 'create' && text[3] !== undefined) {
    			var stmt = "SELECT * FROM groups WHERE name='"+text[3]+"'";
        		db.get(stmt, function(err, row) {
            		if(typeof row == "undefined") {
                    	db.prepare("INSERT INTO groups (name) VALUES (?)").run(text[3]).finalize();
                    	 slack.sendMsg(data.channel, 'Created *' + text[3] + "* group.");
           			} else {
           				slack.sendMsg(data.channel, 'Group *' + text[3] + '* already exists.');
            		}
        		});
    		}
    		else if(text[2] === 'destroy' && text[3] !== undefined) {
    			var stmt = "SELECT * FROM groups WHERE name='"+text[3]+"'";
        		db.get(stmt, function(err, row) {
            		if(typeof row !== "undefined") {
                    	db.run("DELETE FROM groups WHERE name='" + text[3] + "'");
                    	db.run("DELETE FROM members WHERE groupid='" + row.id + "'");
                    	 slack.sendMsg(data.channel, 'Deleted *' + text[3] + "* group.");
           			} else {
           				slack.sendMsg(data.channel, 'Group *' + text[3] + '* does not exist.');
            		}
        		});
    		}
    		else if(text[2] === 'add' && text[3] !== undefined && text[4] !== undefined) {
     			var stmt = "SELECT members.username, groups.id " +
     						"FROM members JOIN groups ON members.groupid = groups.id WHERE members.username='"
     						+ text[4] + "' AND groups.name='"+text[3] + "'";
        		db.get(stmt, function(err, row) {
            		if(typeof row == "undefined") {
            			var getGroup = "SELECT * from groups WHERE groups.name='" + text[3] +"'";
            			console.log(row);
   						db.get(getGroup, function(err, row) {
   							if(row) {
   								db.prepare("INSERT INTO members (groupid, username) VALUES (?,?)").run(row.id, text[4]).finalize();
   								slack.sendMsg(data.channel, 'Added *' + text[4] + '* to *' + row.name + '*');	
   							}
   							else {
   								slack.sendMsg(data.channel, 'This group doesn\'t exist yet. Try using `boilerbot group create <name>`');
   							}
   						});
           			}
           			else {
           				slack.sendMsg(data.channel, '*' + text[4] + '* already belongs to *' + text[3] + '*');
            		}
        		});   			
    		}
    		else if(text[2] === 'remove' && text[3] !== undefined && text[4] !== undefined) {
     			var stmt = "SELECT members.username, groups.id " +
     						"FROM members JOIN groups ON members.groupid = groups.id WHERE members.username='"
     						+ text[4] + "' AND groups.name='"+text[3] + "'";
        		db.get(stmt, function(err, row) {
            		if(typeof row !== "undefined") {
            			var getGroup = "SELECT * from groups WHERE groups.name='" + text[3] +"'";
            			console.log(row);
   						db.get(getGroup, function(err, row) {
   							if(row) {
		           				db.run("DELETE FROM members WHERE groupid='"+row.id+"' AND username='"+text[4]+"'");
		           				slack.sendMsg(data.channel, 'Removed *' + text[4] + '* from *' + text[3] + '*');
   							}
   						});
           			}
           			else {
           				slack.sendMsg(data.channel, '*' + text[4] + '* is not a member of *' + text[3] + '*');
            		}
        		});   			
    		}
    		else if(text[2] === 'membership' && text[3] !== undefined) {
				var stmt = "SELECT members.username, groups.id, groups.name " +
     						"FROM members JOIN groups ON members.groupid = groups.id WHERE members.username='"
     						+ text[3] + "'";
     			db.all(stmt, function(err, rows) {
     				if(rows && rows.length > 0) {
						var list = "*" + text[3] + "* is in ";
        				rows.forEach(function (row) {
        					list += row.name + ", "; 
        				});
        				slack.sendMsg(data.channel, list.slice(0, -2));
     				}
     				else {
     					slack.sendMsg(data.channel, "This user doesn\'t exist or is not in any groups.");
     				}
     			});
    		}
    		else if(text[2] === 'info' && text[3] !== undefined) {
				var stmt = "SELECT members.username, groups.id, groups.name " +
     						"FROM members JOIN groups ON members.groupid = groups.id WHERE groups.name='"
     						+ text[3] + "'";
     			console.log(stmt);
     			db.all(stmt, function(err, rows) {
     				if(rows && rows.length > 0) {
						var list = "*" + text[3] + "* membership:\n";
        				rows.forEach(function (row) {
        					console.log(row);
        					list += row.username + "\n"; 
        				});
        				slack.sendMsg(data.channel, list);
     				}
     				else {
     					slack.sendMsg(data.channel, "Could not find group.");
     				}
     			});
    		}
    		else if(text[2] === 'rename' && text[3] !== undefined && text[4] !== undefined) {
    			var stmt = "SELECT * FROM groups WHERE name='"+text[3]+"'";
    			console.log(stmt);
        		db.get(stmt, function(err, row) {
        			if(row) {
        				var getSecondary = "SELECT * FROM groups WHERE name='"+text[4]+"'";
        				db.get(getSecondary, function(err, row) {
        					if(row) {
        						slack.sendMsg(data.channel, "Group *" + text[4] + "* already exists.");
        					}
        					else {
        						db.run("UPDATE groups SET name='" + text[4] + "' WHERE name='" + text[3] + "'");
        						slack.sendMsg(data.channel, "Group *" + text[3] + "* renamed to *" + text[4] + "*");
        					}
        				});
        			}
        			else {
						slack.sendMsg(data.channel, "Group *" + text[3] + "* does not exist.");
        			}
        		});
    		}
    		else if(text[2] === 'help') {
    			var helptext = "All commands begin with `boilerbot group`\n" + 
    							"`list` - list all groups\n" + 
    							"`create <group>` - create a new group\n" + 
    							"`destroy <group>` - destroy group and remove user memberships\n" + 
    							"`rename <old> <new>` - rename group. new name must be unique\n" + 
    							"`add <group> <name>` - add a member to this group\n" + 
    							"`remove <group> <name>` - remove a member to this group\n" +
    							"`info <group>` - list members in this group\n" + 
    							"`membership <name>` - lists all groups this member is in\n";
    			slack.sendMsg(data.channel, helptext); 
    		}
    	}
	}
    else if (data.text.charAt(0) === '@') {
        var command = data.text.substring(1).split(' ');        
		var stmt = "SELECT members.username, groups.id " +
			"FROM members JOIN groups ON members.groupid = groups.id WHERE groups.name='"+command[0].toLowerCase() + "'";
        db.all(stmt, function(err, rows){
        	if(rows && rows.length > 0) {
                console.log(rows);
        		var mentions = "*@" + command[0].toLowerCase() + ":* ";
                var first = 1;
        		rows.forEach(function (row) {
                    if(first) {
                        mentions += "@" + row.username;
                        first = 0;
                    } else {    
                        mentions += ", @"+row.username; 
                    }
        		});
        		slack.sendMsg(data.channel, mentions);
        	}
        });
    }
});

// slack.on('team_join', function (data) {
//     // Greet a new member that joins
//     slack.sendPM(data.user.id, 'Hellow and welcome to the team! :simple_smile: :beers:');
// });