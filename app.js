require('dotenv').config();
var sqlite3 = require('sqlite3').verbose();
var fs = require("fs");
var file = "local.db";
var exists = fs.existsSync(file);
var db = new sqlite3.Database('local.db');
var slackAPI = require('slackbotapi');
var request = require('superagent');
var moment = require('moment');
var slack = new slackAPI({
    'token': process.env.SLACK_TOKEN,
    'logging': true,
    'autoReconnect': true
});

// Helper functions
function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

function formatCompletion(i) {
    if(i) {
        return ":ballot_box_with_check:";
    }
    else {
        return "uncompleted";
    }
}

function formatStatus(s) {
    if(s === "Up") {
        return ":large_blue_circle:";
    }
    else if(s === "Down") {
        return ":red_circle:";
    }
    return ":question:";
}

db.serialize(function() {
    // If the local.db file doesn't exist, run migrations
	if(!exists) {
		var group_arr = ["dev", "sponsorship"];
		db.run("CREATE TABLE groups (id	INTEGER PRIMARY KEY AUTOINCREMENT, name	TEXT)");
        db.run("CREATE TABLE members (groupid INTEGER, username TEXT)");
        db.run("CREATE TABLE whitelist (channel TEXT)");
		db.run("CREATE TABLE IF NOT EXISTS task (id integer PRIMARY KEY AUTOINCREMENT, groupid integer, \"text\" text, assigned_to text, status integer, deadline text(128));");
		db.run("BEGIN TRANSACTION");
		group_arr.forEach(function(group) {
			db.run("INSERT INTO groups (name) VALUES (?)", [group]);
		 });
    	db.run("END");
	}
});

// On message received
slack.on('message', function (data) {
    // If no text, return.
    if (typeof data.text === 'undefined') return;

    var text = data.text.split(' ');
    console.log(text);
    if(text[0] === process.env.BOT_NAME || text[0] === process.env.BOT_NAME_SHORT) {
    	if(text[1] === 'group' || text[1] === 'g') {
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
    			var helptext = "All commands begin with `" + process.env.BOT_NAME + " OR " + process.env.BOT_NAME_SHORT + " group`\n" + 
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
        else if(text[1] === 'task' || text[1] === 't') {
            if(text[2] !== undefined && text[3] === "list") {
                if(text[4] !== undefined && text[4] === 'all') {
                    var stmt = "SELECT task.id, task.text, task.assigned_to, task.status, task.deadline FROM task JOIN groups ON task.groupid = groups.id WHERE groups.name='"+text[2]+"'";
                }
                else {
                    var stmt = "SELECT task.id, task.text, task.assigned_to, task.status, task.deadline FROM task JOIN groups ON task.groupid = groups.id WHERE groups.name='"+text[2]+"' AND status = 0";
                }
                db.each(stmt, function(err, row) {
                    var str = '#' + row.id + ' ' + row.text + ' (';
                    if(row.assigned_to != null) {
                       str += '*@' + row.assigned_to + '*';
                    }
                    else {
                        str += '*unassigned*';
                    }
                    if(row.deadline != null) {
                        str += ' | ' + row.deadline;
                    }
                    str+= ' | ' + formatCompletion(row.status) + ')';
                     slack.sendMsg(data.channel, str);
                });
            }
            else if(text[2] !== undefined && text[3] === "done" && isNumeric(text[4])) {
                var stmt = "SELECT task.id AS taskid, task.text, task.assigned_to, task.status FROM task JOIN groups ON task.groupid = groups.id " +
                            "WHERE groups.name='" + text[2] + "' AND task.id='" + text[4] + "'";
                db.get(stmt, function(err, row) {
                    if(typeof row !== "undefined") {
                        if(row.status == 0) {
                            db.run("UPDATE task SET status=1 WHERE id='" + text[4] + "'");
                            slack.sendMsg(data.channel, 'Task #' + row.taskid + " has been completed.");
                        }
                        else {
                            slack.sendMsg(data.channel, 'This task has already been completed.');
                        }
                    }
                });
            }
            else if(text[2] !== undefined && text[3] === "add" && text[4] !== undefined) {
                var stmt = "SELECT * FROM groups WHERE groups.name='"+text[2]+"'";
                 db.get(stmt, function(err, row) {
                    if(typeof row !== "undefined") {
                        var str = "";
                        for(var i = 4; i < text.length; i++) {
                            str += text[i] + " ";
                        }
                        db.prepare("INSERT INTO task (groupid, text, status) VALUES (?, ?, 0)").run(row.id, str.slice(0, -1)).finalize();
                        slack.sendMsg(data.channel, 'Task added.');
                    }
                    else {
                        slack.sendMsg(data.channel, 'Couldn\'t find group.');
                    }
                });
            }
            else if(text[2] !== undefined && text[3] === "assign" && isNumeric(text[4]) && text[5] !== undefined) {
                var stmt = "SELECT task.id AS taskid, task.text, task.assigned_to, task.status FROM task JOIN groups ON task.groupid = groups.id " +
                            "WHERE groups.name='" + text[2] + "' AND task.id='" + text[4] + "'";
                db.get(stmt, function(err, row) {
                    if(typeof row !== "undefined") {
                        db.run("UPDATE task SET assigned_to='" + text[5] + "' WHERE id='" + text[4] + "'");
                        slack.sendMsg(data.channel, 'Task #' + row.taskid + " has been assigned to *@" + text[5] + "*");
                    }
                    else {
                        slack.sendMsg(data.channel, 'This task could not be found.');
                    }
                }); 
            }
            else if(text[2] !== undefined && text[3] === "unassign" && isNumeric(text[4])) {
                var stmt = "SELECT task.id AS taskid, task.text, task.assigned_to, task.status FROM task JOIN groups ON task.groupid = groups.id " +
                            "WHERE groups.name='" + text[2] + "' AND task.id='" + text[4] + "'";
                db.get(stmt, function(err, row) {
                    if(typeof row !== "undefined") {
                        db.run("UPDATE task SET assigned_to=NULL WHERE id='" + text[4] + "'");
                        slack.sendMsg(data.channel, 'Task #' + row.taskid + " has been unassigned");
                    }
                    else {
                        slack.sendMsg(data.channel, 'This task could not be found.');
                    }
                }); 
            }
            else if(text[2] !== undefined && text[3] === "delete" && isNumeric(text[4])) {
                var stmt = "SELECT task.id AS taskid, task.text, task.assigned_to, task.status FROM task JOIN groups ON task.groupid = groups.id " +
                            "WHERE groups.name='" + text[2] + "' AND task.id='" + text[4] + "'";
                db.get(stmt, function(err, row) {
                    if(typeof row !== "undefined") {
                        db.run("DELETE FROM task WHERE id='" + text[4] + "'");
                        slack.sendMsg(data.channel, 'Task #' + row.taskid + " has been deleted");
                    }
                    else {
                        slack.sendMsg(data.channel, 'This task could not be found.');
                    }
                }); 
            }
            else if(text[2] !== undefined && text[3] === "date" && isNumeric(text[4]) && text[5] !== undefined) {
                console.log("here");
                var stmt = "SELECT task.id AS taskid, task.text, task.assigned_to, task.status FROM task JOIN groups ON task.groupid = groups.id " +
                            "WHERE groups.name='" + text[2] + "' AND task.id='" + text[4] + "'";
                console.log(stmt);
                db.get(stmt, function(err, row) {
                    if(typeof row !== "undefined") {
                        if(moment(text[5], "MM/DD/YYYY", true).isValid()) {
                            db.run("UPDATE task SET deadline='" + text[5] +"' WHERE id='" + text[4] + "'");
                            slack.sendMsg(data.channel, 'Task #' + row.taskid + " now has deadline *" + text[5] + "*");
                        }
                        else {
                            slack.sendMsg(data.channel, 'Bad date format');
                        }
                    }
                    else {
                        slack.sendMsg(data.channel, 'This task could not be found.');
                    }
                }); 
            }
            else if(text[2] === "help") {
               var helptext = "All commands begin with `" + process.env.BOT_NAME + " OR " + process.env.BOT_NAME_SHORT +" task`\n" + 
                                "`<group> list` - list uncompleted tasks for <group>\n" +
                                "`<group> list all` - list all tasks for <group>\n" +
                                "`<group> add` - create a task item for <group>\n" + 
                                "`<group> done <taskid>` - Mark task with <taskid> as completed\n" + 
                                "`<group> assign <taskid> <name>` - Assign a task with <taskid> to <name>\n" + 
                                "`<group> unassign <taskid>` - Remove name from task with <taskid>\n" +
                                "`<group> date <taskid> <MM/DD/YYYY>` - Add deadline on <MM/DD/YYYY> to task <taskid>\n" +
                                "`<group> delete <taskid>` - Delete task with <taskid>\n";
                slack.sendMsg(data.channel, helptext);  
            }
        }
        else if(text[1] === 'status') {
             request
                .get('https://www.statuscake.com/API/Tests/')
                .set('API', process.env.STATUS_CAKE_API)
                .set('Username', process.env.STATUS_CAKE_USER)
                .end( function(err, res){
                    if(err) {

                    }
                    if(res) {
                        var str = "";
                        res.body.forEach(function(entry) {
                            str += formatStatus(entry.Status) + " *" + entry.WebsiteName + "*  uptime: " + entry.Uptime + "%\n";
                            console.log(entry.TestID);
                        });
                        slack.sendMsg(data.channel, str);
                    }
                });
        }
        else if(text[1] === 'help') {
            var helptext = "All commands begin with `" + process.env.BOT_NAME + " or " + process.env.BOT_NAME_SHORT +"`\n" + 
                        "`group help` - list group help\n" + 
                        "`task help` - list task help\n";
            slack.sendMsg(data.channel, helptext); 
        }
        else if(text[1] === 'whitelist') {
        	if(text[2] === 'add') {
   				var stmt = "SELECT * FROM whitelist WHERE channel='"+data['channel']+"'";
        		db.get(stmt, function(err, row) {
            		if(typeof row == "undefined") {
                    	db.prepare("INSERT INTO whitelist (channel) VALUES (?)").run(data['channel']).finalize();
                    	 slack.sendMsg(data.channel, 'Whitelisted channel');
           			} else {
           				slack.sendMsg(data.channel, 'Already whitelisted');
            		}
        		});
        	} else if(text[2] === 'remove') {
 				var stmt = "SELECT * FROM whitelist WHERE channel='"+data['channel']+"'";
        		db.get(stmt, function(err, row) {
            		if(typeof row !== "undefined") {
                    	db.run("DELETE FROM whitelist WHERE channel='" + data['channel'] + "'");
                    	 slack.sendMsg(data.channel, 'Removed channel from whitelist');
           			} else {
           				slack.sendMsg(data.channel, 'Channel not whitelisted');
            		}
        		});
        	}
        }
	}
    else if (data.text.match(/@\w+/g)) {
    	var matches = data.text.match(/@\w+/g);
    	matches.forEach(function(group) {
       var group = group.substring(1);
		var stmt = "SELECT members.username, groups.id " +
			"FROM members JOIN groups ON members.groupid = groups.id WHERE groups.name='"+group.toLowerCase() + "'";
        db.all(stmt, function(err, rows){
        	if(rows && rows.length > 0) {
                console.log(rows);
        		var mentions = "*@" + group.toLowerCase() + ":* ";
                var first = 1;
        		rows.forEach(function (row) {
                    if(first) {
                        mentions += "<@" + row.username + ">";
                        first = 0;
                    } else {    
                        mentions += ", <@"+row.username + ">"; 
                    }
        		});
        		slack.sendMsg(data.channel, mentions);
        	}
        });
    		// console.log(element);
		});
    } else if(text == "<!channel>") {
		var stmt = "SELECT * FROM whitelist WHERE channel='"+data['channel']+"'";
		db.get(stmt, function(err, row) {
			if(typeof row !== "undefined") {
				slack.sendMsg(data.channel, 'Please use group mentioning instead, `bb group list`');
			}
		});
    }
});

// slack.on('team_join', function (data) {
//     // Greet a new member that joins
//     slack.sendPM(data.user.id, 'Hellow and welcome to the team! :simple_smile: :beers:');
// });
