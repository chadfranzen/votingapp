var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var VoteSchema = new Schema({
	student: { type: Schema.Types.ObjectId, required: true, ref: 'Student' },
	body: { type: String, required: true },
	question: { type: Schema.Types.ObjectId, required: true, ref: 'Question' },
	isCorrect: { type: Boolean, required: true }
});

module.exports = mongoose.model('Vote', VoteSchema);
