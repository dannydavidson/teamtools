

var db = {}
db.section = new Meteor.Collection('section');

if (Meteor.isServer) {

    Meteor.startup(function () {

        var sections = [
            {
                'title': 'ZeroMQ',
                'text': ''
            },
            {
                'title': 'Mongrel2',
                'text': ''
            },
            {
                'title': 'MongoDB + Redis',
                'text': ''
            },
            {
                'title': 'Meteor',
                'text': ''
            },
        ];
        db.section.remove({});
        _.each(sections, function (section) {
            db.section.insert(section);
        });
    });

    Meteor.publish('section', function () {
        return db.section.find({});
    });
}

if (Meteor.isClient) {

    Template.login.connected = function () {
        if (Meteor.user()) {
            var s = Teamtools.sessionId();
            return Teamtools.usersInSession(s);
        }
        return [];
    }

    Template.sessions.sessions = function () {
        var speakers = [];
        var sessions = Teamtools.session.find({});
        sessions.forEach(function (session) {
            var speaker = Meteor.users.findOne(session.speaker)
            if (speaker) {
                speakers.push({'speaker': speaker.username})
            }
        });
        console.log(speakers)
        return speakers;

    }

    Template.sections.sections = function () {
        return db.section.find();
    }

    Template.sections.events({
        'click .btn': function (evt, template) {
            console.log('clicked');
        }
    });

    Accounts.ui.config({
        passwordSignupFields: 'USERNAME_AND_OPTIONAL_EMAIL'
    });

    Meteor.startup(function () {
        Meteor.subscribe('section');
    });
}