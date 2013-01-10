
if (Meteor.isServer) {
    
}

if (Meteor.isClient) {

    Template.login.connected = function () {
        if (Meteor.user()) {
            console.log('updating connected list')
            var s = Teamtools.sessionId();
            console.log("sessionId");
            console.log(s);
            return Teamtools.usersInSession(s);
        }
        return [];
    }

    Accounts.ui.config({
        passwordSignupFields: 'USERNAME_AND_OPTIONAL_EMAIL'
    });

    Meteor.startup(function () {
        
    });
}