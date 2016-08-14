var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var QuestionSchema = new Schema({
	body: { type: String, required: true },
	code: { type: String },
	correctAnswer: { type: String, required: true },
	choices: [{
		letter: { type: String, required: true },
		content: String,
		votes: [{ type: Schema.Types.ObjectId, ref: 'Vote' }]
	}],
	active: { type: Boolean, required: true, default: false },
	voting: { type: Boolean, required: true, default: false },
	dateCreated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Question', QuestionSchema);
