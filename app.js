var _ = require('lodash');
var xmlescape = require('xml-escape');
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var bodyParser = require('body-parser');
var auth = require('http-auth');
var digest = auth.digest({
	realm: 'Admin',
	file: __dirname + '/htpasswd'
});
var twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
var mongoose = require('mongoose');
mongoose.connect('mongodb://ds153835.mlab.com:53835/votingapp', {
	user: process.env.DB_USER,
	pass: process.env.DB_PASS
});
mongoose.Promise = require('bluebird');
var db = mongoose.connection;
var Vote = require('./models/vote.js');
var Question = require('./models/question.js');
var Student = require('./models/student.js');

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

app.get('/vote', auth.connect(digest), function(req, res) {
	res.sendFile(__dirname + '/public/vote.html');
});

app.get('/admin', auth.connect(digest), function(req, res) {
	res.sendFile(__dirname + '/public/admin.html');
});

app.get('/students', auth.connect(digest), function(req, res) {
	res.sendFile(__dirname + '/public/students.html');
});

app.get('/registration', function(req, res) {
	res.sendFile(__dirname + '/public/registration.html');
});

app.get('/twilio', function(req, res) {
	console.log("Request received");
	var body = req.query.Body;
	var from = req.query.From;

  	console.log(from);
  	console.log(body);

	if (isRegistrationText(body)) {
		handleRegistration(body, from, res);
	} else {
		handleVote(body, from, res);
	}

});

var isRegistrationText = function(body) {
	if (!body) {
		return false;
	}
	var words = body.trim().toLowerCase().split(' ');
	return (words.length === 2 && words[0] === 'register')
}

var handleRegistration = function(body, from, res) {
	var netid = body.split(' ')[1].trim().toLowerCase().replace(/[<>]/g, '');
	Student.findOne({phone: from}).then(function(student) {
		if (!student) {
			Student.create({
				phone: from,
				netid: netid
			}).then(function(){
				return sendMessage(res, from + ' is now registered to ' + netid);
			});
		} else {
			if (student.netid == netid) {
				return sendMessage(res, 'You are already registered.');
			}
			student.update({ $set: {netid: netid} }).then(function() {
				return sendMessage(res, from + ' is now registered to ' + netid);
			});
		}
	});
}

var handleVote = function(body, from, res) {
	body = body.trim().toUpperCase();
	
	getActiveQuestion().then(function(question) {
		if (!question || !question.voting) {
			return sendMessage(res, "Sorry, there aren't any active questions right now.")
		}	
		getStudent(from).then(function(student) {
			if (!student) {
				return sendMessage(res, "We didn't store your vote because we don't recognize this number. Did you register?");
			}
			if (alreadyVoted(question, student)) {
				return sendMessage(res, "We already have a response from " + student.netid + " for this question.");
			}
			if (!isValidVote(question, body)) {
				return sendMessage(res, "Please enter a valid response.");
			}
			castVote(question, student, body).then(function() {
				getActiveQuestion().then(function(question) {
					io.emit('update', question);
					return sendMessage(res, "Thanks for voting, " + student.netid + "! Your vote was: " + body);
				});
			});
		});
	});
}

app.get('/api/questions', auth.connect(digest), function(req, res) {
	Question.find().populate('choices.votes').then(function(questions) {
		res.status(200).send(questions);
	});
});

app.get('/api/active', auth.connect(digest), function(req, res) {
	getActiveQuestion().then(function(question) {
		res.status(200).send(question);
	});
});

app.post('/api/questions', auth.connect(digest), function(req, res) {
	Question.create(req.body).then(function() {
		return res.status(200).end();
	});
});

app.post('/api/activate/:id', auth.connect(digest), function(req, res) {
	getActiveQuestion().then(function(activeQuestion) {
		var nextStep = function() {
			Question.update({_id: req.params.id}, {
				$set: {active: true, voting: false}
			}).then(function() {
				res.status(200).end();
			});
		};
		if (activeQuestion) {
			activeQuestion.update({
				$set: {active: false, voting: false}
			}).then(nextStep);
		} else {
			nextStep();
		}
	});
});

app.post('/api/vote', auth.connect(digest), function(req, res) {
	getActiveQuestion().then(function(activeQuestion) {
		activeQuestion.update({
			$set: {voting: req.body.voting}
		}).then(function() {
			res.status(200).end();
		});
	});
});

app.post('/api/reset/:id', auth.connect(digest), function(req, res) {
	Question.findById(req.params.id, function(err, question) {
		_.forEach(question.choices, function(choice) {
			choice.votes = [];
		});
		question.save().then(function() {
			Vote.remove({question: req.params.id}).then(function() {
				res.status(200).end();
			});
		});;
	});
});

app.delete('/api/questions/:id', auth.connect(digest), function(req, res) {
	Question.findByIdAndRemove(req.params.id).then(function() {
		Vote.remove({question: req.params.id}).then(function() {
			res.status(200).end();
		});
	});	
});

app.get('/api/students', auth.connect(digest), function(req, res) {
	Student.find().then(function(students) {
		Vote.find().then(function(votes) {
			var votesMap = {};
			votes.forEach(function(vote) {
				if (votesMap[vote.student]) {
					votesMap[vote.student].push(vote);
				} else {
					votesMap[vote.student] = [vote];
				}
			});
			var result = students.map(function(student) {
				student = student.toJSON();
				student.votes = votesMap[student._id] || [];
				return student;
			});
			res.status(200).send(result);
		});
	});
});

app.get('/api/check/:netid', function(req, res) {
	Student.findOne({netid: req.params.netid}).then(function(student) {
		res.status(200).send({
			registered: !!student
		});
	});
});

var castVote = function(question, student, body) {
	var vote = new Vote({
		student: student._id,
		body: body,
		question: question._id,
		isCorrect: question.correctAnswer === body
	});

	return vote.save().then(function() {
		// Add vote id to the choice's votes array.
		// Pretty sure this is atomic.
		return Question.update(
			{ _id: question._id, 'choices.letter': body },
			{
				'$push': {
					'choices.$.votes': vote._id
				}
			}
		);
	});
}

var isValidVote = function(question, body) {
	return _.find(question.choices, {letter: body});
}

var alreadyVoted = function(question, student) {
	return _.find(question.choices, function(choice) {
		return _.find(choice.votes, function(vote) {
			return vote.student.equals(student._id);
		})
	})
}

var getActiveQuestion = function() {
	return Question.findOne({active: true}).populate('choices.votes').exec();
};

var getStudent = function(phone) {
	return Student.findOne({phone: phone});
};

var sendMessage = function(res, msg) {
	res.send(
		'<?xml version="1.0" encoding="UTF-8"?>'+
		'<Response><Message>'+xmlescape(msg)+'</Message></Response>'
	);
};

db.once('open', function(){
	console.log('Connected to db');
	server.listen(app.get('port'), function() {
		console.log('Node app is running on port', app.get('port'));
	});
});
