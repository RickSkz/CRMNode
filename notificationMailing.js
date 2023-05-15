const e = require('express');
const schedule = require('node-schedule');
const nodemailer = require('nodemailer');
const db = require("./queries")

function notificationMailing() {

    //Check for notifications every day at 11AM (local time wherever the server is)
    const jobDaily = schedule.scheduleJob('0 11 * * *', function()   {
        console.log('Starting daily notification job');
        db.getConfigVariablesLocally(dailyCheck);
    });

    //Check for notifications every week on Monday
    const jobWeekly = schedule.scheduleJob('0 11 * * 1,4', function()   {
        console.log('Starting bi-weekly notification job');
        db.getConfigVariablesLocally(weeklyCheck);
    });


    var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NOTIFICATIONS_EMAIL,
        pass: process.env.EMAIL_PASSWORD,
        }
    });

    var mailOptions = {
        from: process.env.NOTIFICATIONS_EMAIL,
        //to: 'rschilling@plastisurca.com',
    };

    const notificationAnniversaries = (clientList) => {
        if(clientList.length == 0) {
            return;
        } 
        let clientListString = "";
        clientList.forEach(client => {
            clientListString = clientListString + "\n" + client.name;
        });
        mailOptions.subject =  'Aniversario empresas'
        mailOptions.text = 'Buenos días, \n \n \
            Los siguientes clientes tienen el día de hoy como fecha de aniversario: \n\
            ' + clientListString;
        transporter.sendMail(mailOptions, function(error, info){
            if (error) {
            console.log(error);
            } else {
            console.log('Email sent: ' + info.response);
            }
        });
    }


    const notificationBirthdays = (contactList) => {
        if(contactList.length == 0) {
            return;
        } 
        let contactListString = "";
        contactList.forEach(contact => {
            contactListString = contactListString + "\n" + contact.fname + " " + contact.lname + " - " + contact.client_name;
        });
        mailOptions.subject =  'Cumpleaños contactos'
        mailOptions.text = 'Buenos días, \n \n \
            Los siguientes contactos tienen el día de hoy como fecha de cumpleaños: \n\
            ' + contactListString;
        transporter.sendMail(mailOptions, function(error, info){
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });
    }


    const notificationUnattendedClients = (clientList) => {
        if(clientList.length == 0) {
            return;
        } 
        let clientListString = "";
        clientList.forEach(client => {
            clientListString = clientListString + "\n" + client.client_name + " " + client.client_code;
        });
        mailOptions.subject = 'Recordatorio de clientes desatendidos'
        mailOptions.text = 'Buenos días, \n \n \
            Los siguientes clientes fueron marcados como clientes desatendidos (sin actividad ejecutada dentro de las pasadas 3 semanas y sin actividad planificada dentro de los próximos 31 días): \n\
            ' + clientListString;
        transporter.sendMail(mailOptions, function(error, info){
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });
    }

    const notificationDayActivities = (activityList) => {
        if(activityList.length == 0) {
            return;
        } 
        let activityListString = "";
        activityList.forEach(activity => {
            activityListString = activityListString + "\n" + activity.client_name + " - " + activity.description;
        });
        //Get tomorrow's week day
        // var options = { weekday: 'long', month: 'long', day: 'numeric', timeZone: "America/Caracas" };
        // let tomorrow = new Date();
        // tomorrow.setDate(tomorrow.getDate() + 1);
        // tomorrow = tomorrow.toLocaleString('es-US', options);

        mailOptions.subject = 'Recordatorio de actividades programadas'
        mailOptions.text = 'Buenos días, \n \n \
            Las siguientes actividades están programadas para el día de mañana: \n\
            ' + activityListString;
        transporter.sendMail(mailOptions, function(error, info){
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });
    }

    const notificationUnexecutedActivities = (activityList) => {
        if(activityList.length == 0) {
            return;
        } 
        let activityListString = "";
        activityList.forEach(activity => {
            activityListString = activityListString + "\n" + activity.client_name + " - " + activity.description;
        });
        //Get yesterday's week day
        // var options = { weekday: 'long', month: 'long', day: 'numeric', timeZone: "America/Caracas" };
        // let yesterday = new Date();
        // yesterday.setDate(yesterday.getDate() + 1);
        // yesterday = yesterday.toLocaleString('es-US', options);

        mailOptions.subject = 'Recordatorio de actividades rezagadas'
        mailOptions.text = 'Buenos días, \n \n \
            Las siguientes actividades fueron programadas para el día de ayer. Sin embargo, no se marcaron como ejecutadas: \n\
            ' + activityListString;
        transporter.sendMail(mailOptions, function(error, info){
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });
    }

    const dailyCheck = (ob) => {
        mailOptions.to = ob.recipientEmail;
        if(ob.anniversariesFlag) {
            console.log("Querying for client anniversaries");
            db.getTodayAnniversaries(notificationAnniversaries);
        } 
        if(ob.birthdaysFlag) {
            console.log("Querying for contact birthdays");
            db.getTodayBirthdays(notificationBirthdays);
        }
        if(ob.dayActivitiesFlag) {
            console.log("Querying for activities programmed for tomorrow");
            db.getTomorrowActivitiesLocally(notificationDayActivities);
        }
        if(ob.unexecutedActivitiesFlag) {
            console.log("Querying for non-executed activities from yesterday");
            db.getYesterdayUnexecutedActivitiesLocally(notificationUnexecutedActivities);
        }
    }

    const weeklyCheck = (ob) => {
        mailOptions.to = ob.recipientEmail;
        if(ob.unattendedFlag) {
            console.log("Querying for unattended clients");
            db.getUnattendedClientsLocally(notificationUnattendedClients);
        }
    }

}



module.exports = {
    notificationMailing
}