﻿(function () {
    "use strict";

    WinJS.UI.Pages.define("./demos/home.html", {
        ready: function (element, options) {
            var page = this;            
            page.updateLayout();
            $('.section', element).tap(function (elt) {
                var target = $(elt).data('target');
                var title = $('.title', elt).text().trim();
                page.masterDetailView.openDetail(elt, { title: title }, {
                    uri: target,
                    wrapInMasterDetailView : true,
                    prepareHeader: function (arg) {
                        var s = getComputedStyle(elt);
                        arg.header.style.backgroundColor = s.backgroundColor;
                    }
                });
            });
        },

        updateLayout: function (element) {
            var page = this;
            var m = window.matchMedia('screen and (orientation: portrait)');
            var sections = page.$('.home-sections .section');
            if (m.matches) {
                var containerW = page.$('.home-sections').innerWidth() - 40;
                if (containerW >= 560) {
                    var w = ((containerW - 20) / 3);
                } else {
                    var w = ((containerW - 10) / 2);
                }
                sections.css('width', w + 'px').css('height', w + 'px');
                sections.first().css('width', containerW + 'px')

            } else {
                sections.css('width', '').css('height', '');
            }
            var e = element;
        }
    });
})();
