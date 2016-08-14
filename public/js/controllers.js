angular.module('adminControllers', [])
.controller('AdminController', ['$scope', '$http', function($scope, $http) {
	var fetch = function() {
		$http.get('/api/questions').then(function(questions) {
			$scope.questions = questions.data;
		});
	}
	fetch();
	$scope.question = {
		body: '',
		choices: [{letter: 'A'}, {letter: 'B'}, {letter: 'C'}, {letter: 'D'}],
		correctAnswer: 'A',
		code: ''
	}
	$scope.$watch('numChoices', function(newNum, oldNum) {
		var question = $scope.question;
		console.log('numChoices changed to ' + newNum);
		if (newNum > oldNum) {
			for (var i = oldNum; i < newNum; i++) {
				question.choices.push({
					letter: String.fromCharCode(65+i)
				});
			}
		} else {
			question.choices = question.choices.slice(0, newNum);
		}
	});

	var editor = null;
	$scope.codeMirrorLoaded = function(_editor) {
		editor = _editor;
	}

	$scope.submit = function() {
		if (!$scope.question.code) {
			delete $scope.question.code;
		}
		$http.post('/api/questions', $scope.question).then(function() {
			fetch();
		});
	}

	$scope.activate = function(question) {
		$http.post('/api/activate/' + question._id).then(function() {
			fetch();
		});
	};

	$scope.reset = function(question) {
		if (window.confirm('Really reset votes?')) {
			$http.post('/api/reset/' + question._id).then(function() {
				fetch();
			});
		}
	}

	$scope.delete = function(question) {
		if (window.confirm('Really DELETE question? Any votes will also be deleted.')) {
			$http.delete('/api/questions/' + question._id).then(function() {
				fetch();
			});
		}
	}
}]);

angular.module('voteControllers', ['btford.socket-io'])
.factory('socket', ['socketFactory', function(socketFactory){
	return socketFactory();
}])
.controller('VoteController', ['$scope', '$http', 'socket', function($scope, $http, socket) {
	console.log('VoteController running');
	$scope.question = null;
	var fetch = function() {
		$http.get('/api/active').then(function(question) {
			$scope.question = question.data;
		});
	}
	fetch();

	var setVoting = function(voting) {
		$http.post('/api/vote', {voting: voting}).then(function() {
			fetch();
		});
	};
	$scope.$watch('question.voting', function(voting) {
		setVoting(voting);
	});

	$scope.countVotes = function(question) {
		if (!question || !question.choices) {
			return 0;
		}
		return question.choices.reduce(function(sum, choice) {
			return sum + (choice.votes ? choice.votes.length : 0);
		}, 0);
	};

	socket.on('connect', function() {
		console.log("Socket connected");
		socket.on('update', function(question) {
			console.log('Received update');
			$scope.question = question;
		});
	});
}]);

angular.module('studentControllers', [])
.controller('StudentController', ['$scope', '$http', function($scope, $http) {
	$http.get('/api/students').then(function(students) {
		$scope.students = students.data;
	});
	$scope.comparison = 'netid';
	$scope.shouldReverse = false;
	$scope.sortBy = function(newComparison) {
		if ($scope.comparison == newComparison) {
			$scope.shouldReverse = !$scope.shouldReverse;
		} else {
			$scope.comparison = newComparison;
			$scope.shouldReverse = false;
		}
	}
	$scope.getCorrectVotes = function(student) {
		return student.votes.reduce(function(numCorrect, vote) {
			return numCorrect + (vote.isCorrect ? 1 : 0);
		}, 0);
	}
}]);

angular.module('registrationControllers', [])
.controller('RegistrationController', ['$scope' , '$http', function($scope, $http) {
	var students = [];
	$scope.netid = '';
	$scope.checking = false;

	$scope.$watch('netid', function(netid, oldNetid) {
		if (netid && (netid != oldNetid)){
			$scope.checking = true;
			$http.get('/api/check/' + netid).then(function(response) {
				$scope.isRegistered = response.data.registered;
				$scope.checking = false;
			});
		}
	});
}]);
