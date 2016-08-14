var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var StudentSchema = new Schema({
	netid: { type: String, required: true },
	phone: { type: String, required: true }
});

module.exports = mongoose.model('Student', StudentSchema);
