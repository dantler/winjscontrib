﻿var __global = this;

module WinJSContrib.UI.Tests {
    export var logger = WinJSContrib.Logs.getLogger("WinJSContrib.UI.Tests");
    export var config = {
        runSetup: <Function>null,
        runTeardown: <Function>null,
        pageNavigationDelay: 200
    };

    function makeAbsoluteUri(uri) {
        var a = document.createElement("a");
        a.href = uri;
        return a.href;
    }

    export enum TestStatus {
        failed = 0,
        success = 1,
        running = 2,
        pending = -1
    }

    export var RegisteredCampaigns: ICampaign[] = [];

    var BaseScenario = WinJS.Binding.define({
        name: '',
        message: '',
        duration: '',
        state: -1,
        disabled: false,
        run: null,
        setup: null,
        teardown: null
    });

    export interface IScenarioCreationOptions {
        name: string;
        run(document: Document): WinJS.Promise<any>;
        setup?: Function;
        teardown?: Function;
    }

    export function createScenario(options: IScenarioCreationOptions): IScenario {
        var b = <any>BaseScenario;
        var res = new b(options) as IScenario;
        return res;
    }

    export interface IScenario extends IScenarioCreationOptions {
        message: string;
        duration: string;
        state: number;
        disabled: boolean;
    }

    export interface IRunOptions {
        onteststart?: (Scenario: IScenario) => void;
        ontestend?: (Scenario: IScenario) => void;
    }

    export interface ICampaign {
        name: string;
        scenarios: IScenario[];
        nbRun: number;
        nbSuccess: number;
        nbFail: number;
        total: number;
        currentTest: string;
        isRunning: boolean;
        run(options?: IRunOptions): WinJS.Promise<any>;
        runScenario(scenario: IScenario, options?: IRunOptions);
    }

    export interface ITestResult {
        duration?: number;
        success: boolean;
        error: any;
    }

    function promiseForCallback(callback) {
        if (!callback)
            return WinJS.Promise.wrap();

        return WinJS.Promise.as(callback());
    }

    class _Campaign {
        public nbRun: number;
        public nbRunned: number;
        public nbSuccess: number;
        public nbFail: number;
        public total: number;
        public duration: number;
        public currentTest: string;
        public isRunning: boolean;

        constructor(public name: string, public scenarios: IScenario[] = []) {
            (<any>this)._initObservable();
        }

        run(options?: IRunOptions): WinJS.Promise<any> {
            if (this.isRunning)
                return;


            var document = new Document(__global.document.body);
            options = options || {};

            this.total = this.scenarios.length;
            this.nbFail = 0;
            this.nbSuccess = 0;
            this.nbRun = 0;
            this.nbRunned = 0;
            this.duration = 0;
            this.isRunning = true;

            this.scenarios.forEach(function (scenario) {
                scenario.state = TestStatus.pending;
                scenario.duration = "";
                scenario.message = "";
                scenario.disabled = true;
            });

            logger.info("CAMPAIGN START : " + this.name);
            hookAlerts();
            return promiseForCallback(config.runSetup).then(() => {
                return WinJSContrib.Promise.waterfall(this.scenarios, (scenario: IScenario) => {
                    return this._runScenario(document, scenario, options).then((data) => {
                        return WinJS.Promise.timeout(50).then(() => {
                            return data;
                        });
                    });
                });
            }).then((data) => {
                this.isRunning = false;
                this.scenarios.forEach(function (scenario) {
                    scenario.disabled = false;
                });
                return data;
            }).then((data) => {
                unHookAlerts();
                logger.info("CAMPAIGN END : " + this.name);
                return promiseForCallback(config.runTeardown).then(() => {
                    return data;
                });
            });
        }

        public runScenario(scenario: IScenario, options?: IRunOptions) {
            if (this.isRunning)
                return;

            var document = new Document(__global.document.body);
            options = options || {};

            this.total = 1;
            this.nbFail = 0;
            this.nbSuccess = 0;
            this.nbRun = 0;
            this.nbRunned = 0;
            this.duration = 0;
            this.isRunning = true;

            scenario.state = TestStatus.pending;
            scenario.message = "";
            scenario.duration = "";

            this.scenarios.forEach(function (scenario) {
                scenario.disabled = true;
            });

            hookAlerts();
            return promiseForCallback(config.runSetup).then(() => {
                return this._runScenario(document, scenario, options);
            }).then((data) => {
                this.isRunning = false;
                this.scenarios.forEach(function (scenario) {
                    scenario.disabled = false;
                });
                return data;
            }).then((data) => {
                unHookAlerts();
                return promiseForCallback(config.runTeardown).then(() => {
                    return data;
                });
            });
        }

        private _runScenario(document: Document, scenario: IScenario, options?: IRunOptions) {
            options = options || {};
            this.nbRun++;
            scenario.state = TestStatus.running;
            logger.info("TEST RUN START : " + scenario.name);
            this.currentTest = scenario.name;

            if (options.onteststart) {
                options.onteststart(scenario);
            }
            var start = new Date();

            return promiseForCallback(scenario.setup).then(() => {
                return scenario.run(document)
            }).then(() => {
                scenario.state = TestStatus.success;
                this.nbRunned++;
                this.nbSuccess++;
                scenario.message = "";
                return <ITestResult>{ success: true };
            }, (err) => {
                scenario.state = TestStatus.failed;
                this.nbRunned++;
                this.nbFail++;
                if (err.stack) {
                    scenario.message = err.stack;
                } else if (err.message) {
                    scenario.message = err.message;
                } else {
                    scenario.message = JSON.stringify(err);
                }
                logger.error(scenario.message);
                return <ITestResult>{ success: false, error: err };
            }).then((testresult) => {
                var end = new Date();
                testresult.duration = (<any>end - <any>start) / 1000;
                this.duration += testresult.duration;
                scenario.duration = testresult.duration.toFixed(1) + "s";
                logger.info("TEST RUN END : " + scenario.name + " (success: " + testresult.success + ", in " + scenario.duration + ")");
                return promiseForCallback(scenario.teardown).then(() => {
                    return testresult;
                });
            });
        }
    }

    export var Campaign = WinJS.Class.mix(
        _Campaign,
        WinJS.Binding.mixin,
        WinJS.Binding.expandProperties({ nbRun: 0, nbSuccess: 0, nbFail: 0, total: 0, currentTest: 0, nbRunned: 0, duration: 0, isRunning: false })
    );

    function _click(el) {        
        logger.verbose("trigger click");
        if (el.mcnTapTracking) {
            el.mcnTapTracking.callback(el, {});
        } else {
            el.click();
        }

        return this;
    }

    function _waitForElement(parent: HTMLElement, selector: string, timeout: number = 3000): WinJS.Promise<HTMLElement> {
        var completed = false;
        var optimeout = setTimeout(() => {
            completed = true;
        }, timeout);

        var p = new WinJS.Promise<HTMLElement>((complete, error) => {
            var promise = p as any;
            var check = function () {
                var elt = <HTMLElement>parent.querySelector(selector);
                if (!completed && elt) {
                    completed = true;
                    clearTimeout(optimeout);
                    complete(elt);
                } else if (!completed) {
                    setTimeout(() => { check(); }, 50);
                } else {
                    completed = true;
                    error({ message: 'element not found ' + selector });
                }
            }
            check();
        });

        return p;
    }

    function _waitForClass(parent: HTMLElement, classToWatch: string, timeout: number = 3000): WinJS.Promise<any> {
        var completed = false;
        var optimeout = setTimeout(() => {
            completed = true;
        }, timeout);

        var p = new WinJS.Promise<HTMLElement>((complete, error) => {
            var promise = p as any;
            var check = function () {
                var hasClass = parent.classList.contains(classToWatch);
                if (!completed && hasClass) {
                    completed = true;
                    clearTimeout(optimeout);
                    complete();
                } else if (!completed) {
                    setTimeout(() => { check(); }, 50);
                } else {
                    completed = true;
                    error({ message: 'class not added ' + classToWatch });
                }
            }
            check();
        });

        return p;
    }

    function _waitForClassGone(parent: HTMLElement, classToWatch: string, timeout: number = 3000): WinJS.Promise<any> {
        var completed = false;
        var optimeout = setTimeout(() => {
            completed = true;
        }, timeout);

        var p = new WinJS.Promise<HTMLElement>((complete, error) => {
            var promise = p as any;
            var check = function () {
                var classGone = !parent.classList.contains(classToWatch);
                if (!completed && classGone) {
                    completed = true;
                    clearTimeout(optimeout);
                    complete();
                } else if (!completed) {
                    setTimeout(() => { check(); }, 50);
                } else {
                    completed = true;
                    error({ message: 'class not gone ' + classToWatch });
                }
            }
            check();
        });

        return p;
    }

    export class UIElementWrapper {
        constructor(public element: HTMLElement, public selector?: string) {
        }

        getChildView(selector: string): ChildView {
            var elt = this.on(selector);

            if (elt.element.winControl && elt.element.winControl.navigator)
                return new ChildView(elt.element, selector);

            throw new Error("element " + selector + " is not a child view");
        }

        on(selector: string): UIElementWrapper {
            var elt = <HTMLElement>this.element.querySelector(selector);
            if (!elt) {
                logger.error("element action not found for " + selector);
                throw new Error("element action not found for " + selector);
            }
            logger.verbose("element found " + selector);
            var res = new UIElementWrapper(elt, selector);
            return res;
        }

        wait(timeout: number = 3000): WinJS.Promise<any> {
            return WinJS.Promise.timeout(timeout);
        }

        waitForNavigatorPage<T extends Page>(navigator, url: string, pagector?: Function, timeout: number = 3000): WinJS.Promise<T> {
            var completed = false;
            var error = null;
            var absoluteUrl = makeAbsoluteUri(url);
            try {
                throw new Error('page ' + url + ' not found');
            } catch (exception) {
                error = exception;
            }

            logger.verbose("wait for page " + url);
            var optimeout = setTimeout(() => {
                completed = true;
            }, timeout);

            var p = new WinJS.Promise<Page>((pagecomplete, pageerror) => {
                var promise = p as any;
                var check = function () {
                    var pageControl = navigator.pageControl;
                    var location = null;
                    if (pageControl) {
                        location = pageControl.uri;
                    }

                    if (!completed && location === absoluteUrl) {
                        var pageControl = navigator.pageControl;
                        if (pageControl) {
                            var p = pageControl.readyComplete;
                            if (pageControl.pageLifeCycle) {
                                p = pageControl.pageLifeCycle.steps.enter.promise;
                            }
                            p.then(function () {
                                clearTimeout(optimeout);
                                WinJS.Promise.timeout(config.pageNavigationDelay).then(() => {
                                    completed = true;
                                    var res: Page;
                                    if (pagector) {
                                        var ctor = <any>pagector;
                                        res = <Page>new ctor(pageControl.element);
                                    }
                                    else {
                                        res = new Page(pageControl.element);
                                    }
                                    logger.debug("navigated to " + url);
                                    pagecomplete(res);
                                });
                            });
                        }
                    } else if (!completed) {
                        setTimeout(() => { check(); }, 50);
                    } else {
                        completed = true;
                        logger.error("cannot navigate to " + url, error);
                        pageerror(error);
                    }
                }
                check();
            });

            return p;
        }

        waitForPage<T extends Page>(url: string, pagector?: Function, timeout?: number): WinJS.Promise<T> {
            var ui = (<any>WinJSContrib.UI);

            var navigator = (ui && ui.Application) ? ui.Application.navigator : undefined;
            if (!navigator)
                throw new Error("no global navigation defined");

            return this.waitForNavigatorPage<T>(navigator, url, pagector, timeout);
        }

        clickAndWaitForPage<T extends Page>(selector: string, pagetowait: string, pagector?: Function, timeout?: number): WinJS.Promise<T> {
            this.on(selector).click();
            return this.waitForPage<T>(pagetowait, pagector, timeout);
        }

        waitForClass(classToWatch: string, timeout?: number): WinJS.Promise<any> {
            return _waitForClass(this.element, classToWatch, timeout);
        }

        waitForClassGone(classToWatch: string, timeout?: number): WinJS.Promise<any> {
            return _waitForClassGone(this.element, classToWatch, timeout);
        }

        waitForElement(selector: string, timeout?: number): WinJS.Promise<UIElementWrapper> {
            return _waitForElement(this.element, selector, timeout).then((elt) => {
                return new UIElementWrapper(elt, selector);
            });
        }

        click() {
            _click(this.element);

            return this;
        }

        input(val: string) {
            var elt = this.element as HTMLInputElement;
            elt.focus();
            elt.value = val;
            WinJSContrib.Utils.triggerEvent(elt, "change", true, true);
            elt.blur();
            return this;
        }

        textMustEquals(val: string) {
            if (this.element.innerText != val) {
                throw new Error("text mismatch, expected \"" + val + "\" but found \"" + this.element.innerText + "\"");
            }
            return this;
        }

        valueMustEquals(val: string) {
            if ((this.element as HTMLInputElement).value != val) {
                throw new Error("value mismatch, expected \"" + val + "\" but found \"" + (this.element as HTMLInputElement).value + "\"");
            }
            return this;
        }

        disabledMustEquals(val: boolean) {
            if ((this.element as HTMLButtonElement).disabled != val) {
                throw new Error("disabled mismatch, expected \"" + val + "\" but found \"" + (this.element as HTMLButtonElement).disabled + "\"");
            }
            return this;
        }
    }

    export class Document extends UIElementWrapper {
        clearHistory() {
            WinJS.Navigation.history.backStack = [];
        }

        navigateTo<T extends Page>(url: string, args?: any, pagector?: Function): WinJS.Promise<T> {
            return WinJS.Navigation.navigate(url, args).then(() => {
                return WinJS.Promise.timeout(100);
            }).then(() => {
                return this.waitForPage<T>(url, pagector);
            });
        }
    }

    export class Page extends UIElementWrapper {
    }

    export class ChildView extends UIElementWrapper {
        waitForPage<T extends Page>(url: string, pagector?: Function, timeout?: number): WinJS.Promise<T> {
            var navigator = this.element.winControl.navigator;
            if (!navigator) {
                throw new Error("incoherent child view");
            }

            return this.waitForNavigatorPage<T>(navigator, url, pagector, timeout);
        }

        waitForClosed(timeout?: number) {
            return _waitForClass(this.element.winControl.rootElement, "hidden", timeout);
        }

        cancel(timeout?: number) {
            var overlay = this.element.winControl.overlay;
            if (overlay) {
                _click(overlay);                
            }
            throw new Error("overlay not found for childview");
        }
    }

    var _alert_messagebox = WinJSContrib.Alerts.messageBox;
    var _alert_messageboxhook = WinJSContrib.Alerts.messageBox;
    var _reply = {};

    export function alertsReplyWith(reply) {
        _reply = reply;
    }

    export function hookAlerts() {
        if (WinJSContrib.Alerts) {
            _alert_messageboxhook = function (opt) {
                logger.debug("replying to alert call with " + _reply);
                return WinJS.Promise.wrap(_reply);
            }
            WinJSContrib.Alerts.messageBox = _alert_messageboxhook;
        }
    }

    export function unHookAlerts() {
        if (WinJSContrib.Alerts) {
            WinJSContrib.Alerts.messageBox = _alert_messagebox;
        }
    }
}