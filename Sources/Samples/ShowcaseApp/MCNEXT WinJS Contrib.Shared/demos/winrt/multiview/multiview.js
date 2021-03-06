﻿(function () {
    "use strict";

    WinJS.UI.Pages.define("./demos/winrt/multiview/multiview.html", {
        ready: function (element, options) {
            var page = this;

            page.refreshViews();

            WinJSContrib.WinRT.MultipleViews.manager.secondaryViews.onitemremoved = page.refreshViews.bind(page);

            $('#views', page.element).change(function () {
                var id = $('#views', page.element).val();
                page.currentView = parseInt(id);
            });

            WinJSContrib.WinRT.MultipleViews.manager.addEventListener("helloworld", page.treathelloworld.bind(page), false);
        },

        openView: function () {
            var page = this;
            WinJSContrib.WinRT.MultipleViews.manager.openView("./demos/winrt/multiview/childview.html").done(function () {
                page.refreshViews();
            });
        },

        closeView: function () {
            var page = this;
            if (page.currentView) {
                var view = WinJSContrib.WinRT.MultipleViews.manager.findViewByViewId(page.currentView);
                view.close().done(function () {
                    page.currentView = undefined;
                    page.refreshViews();
                });
            }
        },

        sendMessage: function () {
            var page = this;
            if (page.currentView) {
                var view = WinJSContrib.WinRT.MultipleViews.manager.findViewByViewId(page.currentView);
                var txt = $('#txtMessage').val();
                view.send('helloworld', { text: txt });
            }
        },

        treathelloworld: function (data) {
            $('#messages').append('<p>' + data.detail.text + '</p>');
        },

        refreshViews: function () {
            var page = this;
            var views = $('#views', page.element);
            views.html('');
            WinJSContrib.WinRT.MultipleViews.manager.secondaryViews.forEach(function (view) {
                var item = $('<option value="' + view.viewId + '">' + view.viewId + '</option>');
                if (page.currentView == view.viewId || WinJSContrib.WinRT.MultipleViews.manager.secondaryViews.length == 1) {
                    item.attr('selected', 'true');
                    if (!page.currentView)
                        page.currentView = view.viewId;
                }
                views.append(item);
            });
            if (WinJSContrib.WinRT.MultipleViews.manager.secondaryViews.length == 0) {
                page.currentView = undefined;
            }
        },

        unload: function () {
            WinJSContrib.WinRT.MultipleViews.manager.secondaryViews.onitemremoved = null;
        }
    });
})();
