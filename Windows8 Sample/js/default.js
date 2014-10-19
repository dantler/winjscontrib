﻿// For an introduction to the Navigation template, see the following documentation:
// http://go.microsoft.com/fwlink/?LinkId=232506
(function () {
    "use strict";

    WinJS.Binding.optimizeBindingReferences = true;

    var app = WinJS.Application;
    var activation = Windows.ApplicationModel.Activation;
    var nav = WinJS.Navigation;

    // Client logging configuration
    MCNEXT.Logger.Config = {
        "level": MCNEXT.Logger.Levels.all,
        "displayLevelInMessage": true,
        "displayGroupInMessage": true,
        "plugToWinJSLog": false
    };

    function prepareApp(args) {
        app.queueEvent({ type: 'mcnext.app.started', startArgs : args });
    }

    app.addEventListener("activated", function (args) {
        var dataloading = function () {
            //MCNEXT.Utils.momentFr();
            return WinJS.Promise.timeout(2000);
        }

        if (args.detail.kind === activation.ActivationKind.launch) {
            if (args.detail.previousExecutionState !== activation.ApplicationExecutionState.terminated) {
                // TODO: This application has been newly launched. Initialize
                // your application here.
            } else {
                // TODO: This application has been reactivated from suspension.
                // Restore application state here.
            }

            if (app.sessionState.history) {
                nav.history = app.sessionState.history;
            }

            
            
            var preparepage = WinJS.UI.processAll().then(function () {
                return MCNEXT.UI.Application.splashscreen.init(args);
            });

            args.setPromise(preparepage);

            preparepage.then(function () {
                return MCNEXT.UI.Application.splashscreen.show(dataloading());
            }).then(function appInitSuccess() {
                return WinJS.Navigation.navigate("/pages/home/home.html")
            }, function appInitError(err) {
                return WinJS.Navigation.navigate("/pages/errorPage/errorPage.html");
            }).then(function () {
                var ratecontr = document.getElementById('ratecontr');
                ratecontr.winControl.check();
                MCNEXT.UI.Application.splashscreen.hide();
                MCNEXT.UI.Application.navigator.addEventListener('pageContentReady', function (arg) {
                    setImmediate(function () { 
                        $('.codelink', arg.detail.page.element).addClass('visible').tap(function (elt) {
                            var target = $(elt).data('codepage')
                            var codeview = document.getElementById('codeviewFlyout');
                            var html = $('section[role=main]', arg.detail.page.element).html();
                            codeview.winControl.open('/pages/showcode/showcode.html', { target: target, html: html });
                        });
                    });
                });
            });
        }
    });

    app.addEventListener("settings", function (e) {
        e.detail.applicationcommands = {
            "aboutSettingsFlyout": { href: '/pages/settings/about/aboutPage.html', title: "About..." },
            "whatsNewSettingsFlyout": { href: '/pages/settings/whatsnew/whatsnew.html', title: "What's new ?" }
        };
        WinJS.UI.SettingsFlyout.populateSettings(e);        
    });

    app.oncheckpoint = function (args) {
        // TODO: This application is about to be suspended. Save any state
        // that needs to persist across suspensions here. If you need to 
        // complete an asynchronous operation before your application is 
        // suspended, call args.setPromise().
        app.sessionState.history = nav.history;
        MultipleViews.manager.closeAll();
    };

    app.start();
})();
