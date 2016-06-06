var __global = this;
declare module WinJSContrib.UI.WebComponents {
	var watch: any;
}

var profiler = __global.msWriteProfilerMark || function () { };

module WinJSContrib.UI.Pages {
    function abs(uri) {
        var a = window.document.createElement("a");
        a.href = uri;
        return a.href;
    }

    var logger = WinJSContrib.Logs.getLogger("WinJSContrib.UI.Pages");
    export var verboseTraces = false;
    export var preloadDelay = 250;

    var loadedPages = {};

    export function preload(...pathes: string[]) {
        return WinJSContrib.Promise.waterfall(pathes, (path) =>{
            return preloadPath(path);
        })
    }

    export function preloadPath(path : string) {        
        var absuri = abs(path);
        if (!loadedPages[absuri]) {
            logger.verbose("preload " + absuri);
            loadedPages[absuri] = true;
            return WinJS.Promise.timeout(preloadDelay).then(() => {
                return WinJS.Utilities.Scheduler.schedule(() => {                    
                    WinJS.UI.Fragments.cache(absuri);
                }, WinJS.Utilities.Scheduler.Priority.idle, {}, "preload|" + absuri);
            });
        }        
        return WinJS.Promise.wrap();
    }

    /**
     * List of mixins to apply to each fragment managed by WinJS Contrib (through navigator or by calling explicitely {@link WinJSContrib.UI.Pages.fragmentMixin}).
     * @field WinJSContrib.UI.Pages.defaultFragmentMixins
     * @type {Array}
     */
    export var defaultFragmentMixins: Array<any> = [{
		$: function (selector) {
			return $(selector, this.element || this._element);
		},
		q: function (selector) {
			if (!this.element)
				return;

			return this.element.querySelector(selector);
		},

		qAll: function (selector) {
			if (!this.element)
				return;

			var res = this.element.querySelectorAll(selector);
			if (res && !res.forEach) {
				res = [].slice.call(res);
			}
			return res;
		},
	},
		{
			initPageMixin : function(){
                //this.promises = this.promises || [];
			},

			disposePageMixin: function () {
				if (this.promises) {
					this.cancelPromises();
					this.promises = [];
				}
			},

			addPromise: function (prom) {
				this.promises.push(prom);
				return prom;
			},

			cancelPromises: function () {
				var page = this;
				if (page.promises) {
					for (var i = 0; i < page.promises.length; i++) {
						if (page.promises[i]) {
							page.promises[i].cancel();
						}
					}
					page.promises = [];
				}
			}
		},
		{
			initPageMixin: function() {
				this.eventTracker = new WinJSContrib.UI.EventTracker();
			},

			disposePageMixin: function() {
				if (this.eventTracker) {
					this.eventTracker.dispose();
					this.eventTracker = null;
				}
			},
		}];


    function broadcast(ctrl, element, eventName, args, before?, after?) {
        var promises = [];
        if (before)
            promises.push(WinJS.Promise.as(before.apply(ctrl, args)));
        var query = element.querySelectorAll(".mcn-layout-ctrl");
        if (query && query.length) {
            var index = 0;
            var length = query.length;
            while (index < length) {
                var childctrl = query[index];
                if (childctrl) {
                    var event = childctrl.winControl[eventName];
                    if (event) {
                        if (childctrl.winControl.pageLifeCycle) {
                            promises.push(childctrl.winControl.pageLifeCycle.steps.layout.promise);
                            //promises.push(childctrl.winControl.pageLifeCycle.steps.layout.attach(function () {
                            //    event.apply(childctrl.winControl, args);
                            //}));
                        }
                        else {
                            promises.push(WinJS.Promise.as(event.apply(childctrl.winControl, args)));
                        }
                    }
                }
                // Skip descendants
                if (childctrl && childctrl.winControl && childctrl.winControl.pageLifeCycle) {
                    index += childctrl.querySelectorAll(".mcn-fragment, .mcn-layout-ctrl").length + 1;
                    childctrl.winControl.__checkLayout();
                }
                else {
                    index += 1;
                }
            }

            //if (after)
            //    promises.push(WinJS.Promise.as(after.apply(ctrl, args)));
            return WinJS.Promise.join(promises).then(function () {
                if (after)
                    return WinJS.Promise.as(after.apply(ctrl, args));
            });
        }
        else {
            if (after)
                return WinJS.Promise.as(after.apply(ctrl, args));

            return WinJS.Promise.wrap();
        }
    }

    /**
     * render a html fragment with winjs contrib pipeline and properties, and add WinJS Contrib page events.
     * @function WinJSContrib.UI.Pages.renderFragment
     * @param {HTMLElement} container element that will contain the fragment
     * @param {string} location url for the fragment
     * @param {Object} args arguments to the fragment
     * @param {Object} options rendering options
     */
    export function renderFragment(container, location, args, options) {
        
        var fragmentCompleted;
        var fragmentError;
        options = options || {};
        var element = document.createElement("div");
        element.setAttribute("dir", __global.getComputedStyle(element, null).direction);
        element.style.opacity = '0';
        container.appendChild(element);

        var fragmentPromise = new WinJS.Promise(function (c, e) { fragmentCompleted = c; fragmentError = e; });
        var parented = options.parented ? WinJS.Promise.as(options.parented) : null;
        var layoutCtrls = [];
        var pageConstructor = WinJS.UI.Pages.get(location);

        function preparePageControl(elementCtrl) {
            if (options.getFragmentElement) {
                options.getFragmentElement(elementCtrl);
            }
            if (args && args.injectToPage) { //used by childviewflyout to inject custom functions
                WinJSContrib.Utils.inject(elementCtrl, args.injectToPage);
            }
            elementCtrl.navigationState = { location: location, state: args };
			if (options.oncreate) {
				options.oncreate(elementCtrl.element, args);
			}

			if (options.oninit) {
				elementCtrl.pageLifeCycle.steps.init.attach(function () {
					return options.oninit(elementCtrl.element, args);
				});
			}

            if (elementCtrl.enterPageAnimation || options.enterPage) {
                if (elementCtrl.enterPageAnimation)
                    elementCtrl._enterAnimation = elementCtrl.enterPageAnimation;
                else
                    elementCtrl._enterAnimation = options.enterPage;

                elementCtrl.enterPageAnimation = function () {
                    var page = this;
                    var elts = null;
                    element.style.opacity = '';
                    if (page && page.getAnimationElements) {
                        elts = page.getAnimationElements(false);
                    } else {
                        elts = page.element;
                    }
					
                    if (elts)
                        return page._enterAnimation(elts);
                }
            }

			if (options.onrender) {
				elementCtrl.pageLifeCycle.steps.process.attach(function () {
					options.onrender(elementCtrl.element, args);
				});
			}

			if (!WinJSContrib.UI.disableAutoResources) {
				elementCtrl.pageLifeCycle.steps.process.attach(function () {
					return WinJS.Resources.processAll(element);
				});
			}

			if (options.closeOldPagePromise) {
				elementCtrl.pageLifeCycle.steps.ready.attach(function () {
					return options.closeOldPagePromise;
				});
			}

            if (options.onready) {
                elementCtrl.pageLifeCycle.steps.ready.attach(function() {
                    if (options.onready)
                        options.onready(elementCtrl.element, args);
                });
            }

            elementCtrl.pageLifeCycle.steps.enter.attach(function() {
                if (elementCtrl.enterPageAnimation) {
                    return WinJS.Promise.as(elementCtrl.enterPageAnimation(element, options));
                } else {
                    elementCtrl.element.style.opacity = '';
                }
			});

			elementCtrl.pageLifeCycle.steps.ready.promise.then(fragmentCompleted, fragmentError);
        }

        var elementCtrl = new pageConstructor(element, args, preparePageControl, parented);

        return fragmentPromise;
    }

    export interface PageLifeCycle {
        created: Date,
        location: string,
        log : (callback : ()=>void) => void,
        stop: () => void,
        steps: {
            init: PageLifeCycleStep,
            render: PageLifeCycleStep,
            process: PageLifeCycleStep,
            layout: PageLifeCycleStep,
            ready: PageLifeCycleStep,
            enter: PageLifeCycleStep,
        },
        initialDisplay: string
    }

    export class DefferedLoadings{
        resolved: boolean;
        page: any;
        items: (() => void | WinJS.Promise<any>)[];

        constructor(page) {
            this.items = [];
            this.page = page;
            this.resolved = false;
            page.promises.push(page.pageLifeCycle.steps.ready.promise.then(()=>{
                return this.resolve();
            }));
        }

        push(delegate: () => void | WinJS.Promise<any>) {
            if (!this.resolved) {
                this.items.push(delegate);
            }else{
                setImmediate(() => {
                    this.page.promises.push(WinJS.Promise.as(delegate()));
                })
            }
        }

        resolve(){
            this.resolved = true;
            if (!this.items.length){
                return WinJS.Promise.wrap();
            }

            logger.verbose("resolve deffered loads");
            return WinJSContrib.Promise.waterfall(this.items, (job) =>{
                return WinJS.Promise.as(job()).then(() => {
                    return WinJS.Promise.timeout();
                });
            });
        }
    }

    export class PageBase {
        public eventTracker: WinJSContrib.UI.EventTracker;
        public element: HTMLElement;
        public promises: WinJS.Promise<any>[];
        public defferedLoading: DefferedLoadings;
        public pageLifeCycle: PageLifeCycle;
        public parentedComplete: WinJS.Promise<any>;
        public q: (selector: string) => Element;
        public qAll: (selector: string) => Element[];
        public addPromise: (prom: WinJS.Promise<any>) => void;
    }

    export class ChildViewFlyoutPageBase extends PageBase {
        public close: (result?: any) => void;
    }

	export class PageLifeCycleStep {
		public promise: WinJS.Promise<any>;
		public isDone: boolean;
		public created: Date;
		public resolved: Date;
		public stepName: string;
        public page: any;
		_resolvePromise: any;
		_rejectPromise: any;
		public queue: Array<any>;

		constructor(page, stepName, parent) {
            this.page = page;
			this.queue = [];
			this.isDone = false;
			this.stepName = stepName;
            if (verboseTraces) {
                this.created = new Date();
            }

			this.promise = new WinJS.Promise((c, e) => {
				this._resolvePromise = c;
				this._rejectPromise = e;
			});
			page.promises.push(this.promise);

			//if their is a parent page fragment, we attach step to synchronize page construction
			if (parent && parent.pageLifeCycle) {
				parent.pageLifeCycle.steps[stepName].attach(() => {
					return this.promise;
				});
			}
		}

		public attach(callback) {
			if (this.queue && !this.isDone) {
				this.queue.push(callback);
				return this.promise;
			} else {
				return WinJS.Promise.as(callback());
			}
		}

		public resolve(arg) {
			var step = this;
			this.isDone = true;

			function closeStep() {
				step.resolved = new Date();
                step._resolvePromise(arg);

                if (verboseTraces) {
                    step.resolved = new Date();
                    logger.verbose((<any>step.resolved - <any>step.created) + 'ms ' + step.stepName.toUpperCase() + ' ' + step.page.pageLifeCycle.profilerMarkIdentifier);
                    profiler("WinJS.UI.Pages:" + step.stepName.toUpperCase() + step.page.pageLifeCycle.profilerMarkIdentifier + ",StartTM");
                }
                
				return step.promise;
			}

			if (this.queue && this.queue.length) {
				var promises = [];
				this.queue.forEach((q) => {
					promises.push(new WinJS.Promise(function (c, e) {
						try {
							WinJS.Promise.as(q()).then(function (res) {
								c(res);
							}, e);
						} catch (exception) {
							e(exception);
						}
					}));
				});
				this.queue = null;
				return WinJS.Promise.join(promises).then(() => {
					return closeStep();
				}, this.reject.bind(this));

			} else {
				this.queue = null;
				return closeStep();
			}

		}

		public reject(arg) {
			this.isDone = true;
			this.queue = null;
			this._rejectPromise(arg);
			return WinJS.Promise.wrapError(this.promise);
		}
	}

	(function (_Pages, _Global, _Base, _CorePages, _BaseUtils, _ElementUtilities, _WriteProfilerMark, Promise, Fragments, ControlProcessor) {
        'use strict';

		if (!_Global.document || !_CorePages) //running outside a document
			return;

        var viewMap = _CorePages._viewMap || _CorePages.viewMap || {};

        //this property allows defining mixins applyed to all pages
        
        function abs(uri) {
            var a = _Global.document.createElement("a");
            a.href = uri;
            return a.href;
        }

        function selfhost(uri) {
            return _Global.document.location.href.toLowerCase() === uri.toLowerCase();
        }

        var _mixinBase = {
            dispose: function () {
                /// <signature helpKeyword="WinJS.UI.Pages.dispose">
                /// <summary locid="WinJS.UI.Pages.dispose">
                /// Disposes this Page.
                /// </summary>
                /// </signature>
                if (this._disposed) {
                    return;
                }
                if (this.disposePageMixin) {
                    this.disposePageMixin();
                }
				this.pageLifeCycle.stop();
				this.pageLifeCycle = null;
                this._disposed = true;
				this.readyComplete.cancel();
                _ElementUtilities.disposeSubTree(this.element);
                this.element = null;
            },

            init: function () {
			},

            load: function (uri) {
                /// <signature helpKeyword="WinJS.UI.Pages._mixin.load">
                /// <summary locid="WinJS.UI.Pages._mixin.load">
                /// Creates a copy of the DOM elements from the specified URI.  In order for this override
                /// to be used, the page that contains the load override needs to be defined by calling
                /// WinJS.UI.Pages.define() before WinJS.UI.Pages.render() is called.
                /// </summary>
                /// <param name="uri" locid="WinJS.UI.Pages._mixin.load_p:uri">
                /// The URI from which to copy the DOM elements.
                /// </param>
                /// <returns type="WinJS.Promise" locid="WinJS.UI.Pages._mixin.load_returnValue">
                /// A promise whose fulfilled value is the set of unparented DOM elements, if asynchronous processing is necessary. If not, returns nothing.
                /// </returns>
                /// </signature>
                if (!this.selfhost) {
                    return Fragments.renderCopy(abs(uri));
                }
            },

            process: function (element, options) {
                /// <signature helpKeyword="WinJS.UI.Pages._mixin.process">
                /// <summary locid="WinJS.UI.Pages._mixin.process">
                /// Processes the unparented DOM elements returned by load.
                /// </summary>
                /// <param name="element" locid="WinJS.UI.Pages._mixin.process_p:element">
                /// The DOM element that will contain all the content for the page.
                /// </param>
                /// <param name="options" locid="WinJS.UI.Pages._mixin.process_p:options">
                /// The options that are to be passed to the constructor of the page.
                /// </param>
                /// <returns type="WinJS.Promise" locid="WinJS.UI.Pages._mixin.process_returnValue">
                /// A promise that is fulfilled when processing is complete.
                /// </returns>
                /// </signature>
                return ControlProcessor.processAll(element);
            },

            processed: function (element, options) { },

            render: function (element, options, loadResult) {
                /// <signature helpKeyword="WinJS.UI.Pages._mixin.render">
                /// <summary locid="WinJS.UI.Pages._mixin.render">
                /// Renders the control, typically by adding the elements specified in the loadResult parameter to the specified element.
                /// </summary>
                /// <param name="element" locid="WinJS.UI.Pages._mixin.render_p:element">
                /// The DOM element that will contain all the content for the page.
                /// </param>
                /// <param name="options" locid="WinJS.UI.Pages._mixin.render_p:options">
                /// The options passed into the constructor of the page.
                /// </param>
                /// <param name="loadResult" locid="WinJS.UI.Pages._mixin.render_p:loadResult">
                /// The elements returned from the load method.
                /// </param>
                /// <returns type="WinJS.Promise" locid="WinJS.UI.Pages._mixin.render_returnValue">
                /// A promise that is fulfilled when rendering is complete, if asynchronous processing is necessary. If not, returns nothing.
                /// </returns>
                /// </signature>
                if (!this.selfhost) {
                    element.appendChild(loadResult);
                }
                return element;
            },

			rendered: function (element, options) { },

            ready: function () { }
        };

		function injectMixin(base, mixin) {
			var d = base.prototype.dispose;
			var dM = base.prototype.disposePageMixin;
			var iM = base.prototype.initPageMixin;
			base = _Base.Class.mix(base, mixin);

			//we want to allow this mixins to provide their own addition to "dispose" and initialize custom properties
			if (d && mixin.hasOwnProperty('dispose')) {
				base.prototype.dispose = function() {
					mixin.dispose.apply(this);
					if (d) d.apply(this);
				};
			} 

			if (d && mixin.hasOwnProperty('disposePageMixin')) {
				base.prototype.disposePageMixin = function() {
					mixin.disposePageMixin.apply(this);
					if (dM) dM.apply(this);					
				};
			}

			if (d && mixin.hasOwnProperty('initPageMixin')) {
				base.prototype.initPageMixin = function() {
					mixin.initPageMixin.apply(this);
					if (iM) iM.apply(this);
				};
			}

			return base;
		}

        function mergeJavaScriptClass(baseCtor, classDef) {

            var keys = Object.keys(baseCtor.prototype);
            keys.forEach(function (k) {
                if (classDef.prototype[k] === undefined) {
                    classDef.prototype[k] = baseCtor.prototype[k];
                }
            });

            return baseCtor;
        }

        function addMembers(ctor, members) {
            if (!members)
                return ctor;

            if (typeof members == 'function') {
                ctor.prototype._attachedConstructor = members;
                return mergeJavaScriptClass(ctor, members);
            } else if (typeof members == 'object') {
                return injectMixin(ctor, members);
            }

            return ctor;
        }

		function pageLifeCycle(that, uri, element, options, complete, parentedPromise) {

			if (element.style.display)
				that.pageLifeCycle.initialDisplay = element.style.display;
			element.style.display = 'none';

			var profilerMarkIdentifier = " uri='" + uri + "'" + _BaseUtils._getProfilerMarkIdentifier(that.element);
            that.pageLifeCycle.profilerMarkIdentifier = profilerMarkIdentifier;

			_WriteProfilerMark("WinJS.UI.Pages:createPage" + profilerMarkIdentifier + ",StartTM");

			if (WinJSContrib.UI.WebComponents) {
				that.pageLifeCycle.observer = WinJSContrib.UI.WebComponents.watch(that.element);
			}
            
            var load = Promise.timeout().then(function Pages_load() {
				that.pageLifeCycle.log(() => "URI loading " + that.pageLifeCycle.profilerMarkIdentifier);
                return that.load(uri);
            }).then(function (loadResult) {
                that.pageLifeCycle.log(() => "URI loaded " + that.pageLifeCycle.profilerMarkIdentifier);
                //if page is defined by Js classes, call class constructors 
                if (that._attachedConstructor) {
                    var realControl = new that._attachedConstructor(element, options);
                    element.winControl = realControl;
                    var keys = Object.keys(that);
                    keys.forEach(function (k) {
                        realControl[k] = that[k];
                    });
                    realControl.pageLifeCycle.page = realControl;
                    that.pageControl = realControl;
                    that.dismissed = true;
                    that = realControl;
                }

                return loadResult;
            });

			var renderCalled = load.then(function Pages_init(loadResult) {
				return Promise.join({
					loadResult: loadResult,
					initResult: that.init(element, options)
				});
			}).then(function Pages_render(result) {
				return that.pageLifeCycle.steps.init.resolve().then(function () {
					return result;
				});
			}).then(function Pages_render(result) {
				return that.render(element, options, result.loadResult);
			}).then(function Pages_render(result) {
				return that.rendered(element, options);
			}).then(function (result) {
				return that.pageLifeCycle.steps.render.resolve();
            }).then(function Pages_processed() {
                if (WinJSContrib.UI.WebComponents) {
                    //add delay to enable webcomponent processing
                    return WinJS.Promise.timeout();
                }
            });

			that.elementReady = renderCalled.then(function () {
				return element;
			});

			that.renderComplete = renderCalled.then(function Pages_process() {
				return that.process(element, options);
			}).then(function (result) {
				return that.pageLifeCycle.steps.process.resolve();
			}).then(function Pages_processed() {
				WinJSContrib.UI.bindMembers(element, that);
				return that.processed(element, options);
			}).then(function () {
                return that;
			});

			var callComplete = function () {
				complete && complete(that);
				_WriteProfilerMark("WinJS.UI.Pages:createPage" + profilerMarkIdentifier + ",StopTM");
			};

			// promises guarantee order, so this will be called prior to ready path below
			//
			that.renderComplete.then(callComplete, callComplete);

			that.layoutComplete = that.renderComplete.then(function () {
				return parentedPromise;
			}).then(function () {
				element.style.display = that.pageLifeCycle.initialDisplay || '';
				var r = element.getBoundingClientRect(); //force element layout

				return broadcast(that, element, 'pageLayout', [element, options], null, that.pageLayout);
			}).then(function () {
				WinJSContrib.UI.bindActions(element, that);
			}).then(function (result) {
				return that.pageLifeCycle.steps.layout.resolve();
			}).then(function () {
				return that;
			});

			that.readyComplete = that.layoutComplete.then(function Pages_ready() {

				that.ready(element, options);

				that.pageLifeCycle.ended = new Date();
				that.pageLifeCycle.delta = that.pageLifeCycle.ended - that.pageLifeCycle.created;                

				//broadcast(that, element, 'pageReady', [element, options]);
			}).then(function (result) {
				return that.pageLifeCycle.steps.ready.resolve();
            }).then(function(result) {
                return that.pageLifeCycle.steps.enter.resolve();
            }).then(function() {
				return that;
			}).then(
				null,
				function Pages_error(err) {
					if (that.error)
                        return that.error(err);

                    if (err && err._value && err._value.name === "Canceled")
                        return;

                    return WinJS.Promise.wrapError(err);
				});

			that.__checkLayout = function () {
				var page = this;
				var updateLayoutArgs = arguments;
				var p = null;

				if (page.updateLayout) {
					p = WinJS.Promise.as(page.updateLayout.apply(page, updateLayoutArgs));
				} else {
					p = WinJS.Promise.wrap();
				}

				return p.then(function () {
					return broadcast(page, page.element, 'updateLayout', updateLayoutArgs);
				});
			}
		}

        function getPageConstructor(uri, members?) {
            /// <signature helpKeyword="WinJS.UI.Pages.define">
            /// <summary locid="WinJS.UI.Pages.define">
            /// Creates a new page control from the specified URI that contains the specified members.
            /// Multiple calls to this method for the same URI are allowed, and all members will be
            /// merged.
            /// </summary>
            /// <param name="uri" locid="WinJS.UI.Pages.define_p:uri">
            /// The URI for the content that defines the page.
            /// </param>
            /// <param name="members" locid="WinJS.UI.Pages.define_p:members">
            /// Additional members that the control will have.
            /// </param>
            /// <returns type="Function" locid="WinJS.UI.Pages.define_returnValue">
            /// A constructor function that creates the page.
            /// </returns>
            /// </signature>
            var refUri = abs(uri).toLowerCase();
            var base = viewMap[refUri];
            uri = abs(uri);

            if (!base) {
                base = _Base.Class.define(
                    // This needs to follow the WinJS.UI.processAll "async constructor"
                    // pattern to interop nicely in the "Views.Control" use case.
                    //
                    function PageControl_ctor(element, options, complete, parentedPromise) {
                        var that = this;

						if (that._attachedConstructor) {
							var realControl = new this._attachedConstructor(element, options);
							element.winControl = realControl;
							var keys = Object.keys(that);
							keys.forEach(function(k) {
								if (k !== "_attachedConstructor") {
									realControl[k] = that[k];
								}
							});
							
							that = realControl;
						}

						var parent = WinJSContrib.Utils.getScopeControl(element);
						_ElementUtilities.addClass(element, "win-disposable");
						_ElementUtilities.addClass(element, "pagecontrol");
						_ElementUtilities.addClass(element, "mcn-layout-ctrl");

						
                        //that._eventTracker = new WinJSContrib.UI.EventTracker();
                        that.promises = [];
                        
                        that.pageLifeCycle = <PageLifeCycle>{
							created: new Date(),
							location: uri,
                            log : function(callback){
                                if (verboseTraces){
                                    var delta = <any>new Date() - this.created;
                                    logger.verbose(delta + "ms " + callback());
                                }
                            },
							stop: function () {
								that.readyComplete.cancel();
								that.cancelPromises();
								if (this.observer) {
									this.observer.disconnect();
									this.observer = null;
								}
							},
							steps: {
								init: new PageLifeCycleStep(that, 'init', null),
								render: new PageLifeCycleStep(that, 'render', null),
								process: new PageLifeCycleStep(that, 'process', parent),
								layout: new PageLifeCycleStep(that, 'layout', parent),
								ready: new PageLifeCycleStep(that, 'ready', parent),
                                enter: new PageLifeCycleStep(that, 'enter', parent),
							},
							initialDisplay: null
						};

                        if (that.initPageMixin)
                            that.initPageMixin();

                        that.defferedLoading = new DefferedLoadings(that);

                        that._disposed = false;
                        that.element = element = element || _Global.document.createElement("div");
                        element.msSourceLocation = uri;
                        that.uri = uri;
                        that.selfhost = selfhost(uri);
                        element.winControl = that;
                        that.parentedComplete = parentedPromise;



                        pageLifeCycle(that, uri, element, options, complete, parentedPromise);
                        return that;
                    }, _mixinBase);
                base = _Base.Class.mix(base, WinJS.UI.DOMEventMixin);
                
                //inject default behaviors to page constructor
                WinJSContrib.UI.Pages.defaultFragmentMixins.forEach(function (mixin) {
                    injectMixin(base, mixin);
                });
				//WinJSContrib.UI.Pages.fragmentMixin(base);
                viewMap[refUri] = base;
            }

            base = addMembers(base, members);

            base.selfhost = selfhost(uri);

            return base;
        }

        function Pages_define(uri, members?) {
            /// <signature helpKeyword="WinJS.UI.Pages.define">
            /// <summary locid="WinJS.UI.Pages.define">
            /// Creates a new page control from the specified URI that contains the specified members.
            /// Multiple calls to this method for the same URI are allowed, and all members will be
            /// merged.
            /// </summary>
            /// <param name="uri" locid="WinJS.UI.Pages.define_p:uri">
            /// The URI for the content that defines the page.
            /// </param>
            /// <param name="members" locid="WinJS.UI.Pages.define_p:members">
            /// Additional members that the control will have.
            /// </param>
            /// <returns type="Function" locid="WinJS.UI.Pages.define_returnValue">
            /// A constructor function that creates the page.
            /// </returns>
            /// </signature>

            var ctor = viewMap[uri];

            if (!ctor) {
                ctor = getPageConstructor(uri);
            }

            if (members) {
                ctor = addMembers(ctor, members);
            }

            if (ctor.selfhost) {
                WinJS.Utilities.ready(function () {
                    render(abs(uri), _Global.document.body);
                }, true);
            }

			//in case we are on WinJS<4 we reference members on WinJS Core Pages
			if (!_CorePages.viewMap && !_CorePages._viewMap && typeof members !== 'function')
				_Pages._corePages.define(uri, members);

            return ctor;
        }

        function render(uri, element, options?, parentedPromise?) {
            var Ctor = _CorePages.get(uri);
            loadedPages[abs(uri)] = true;
            var control = new Ctor(element, options, null, parentedPromise);
            return control.renderComplete.then(null, function (err) {
                return Promise.wrapError({
                    error: err,
                    page: control
                });
            });
        }

        function get(uri) {
            var ctor = viewMap[uri];
            if (!ctor) {
                ctor = Pages_define(uri);
            }
            return ctor;
        }

        function remove(uri) {
            Fragments.clearCache(abs(uri));
            delete viewMap[uri.toLowerCase()];
        }

        _Pages._corePages = {
            get: _CorePages.get,
            render: _CorePages.render,
            define: _CorePages.define,
            _remove: _CorePages._remove,
            _viewMap: viewMap,
        }

        var pageOverride = {
            define: Pages_define,
            get: get,
            render: render,
            _remove: remove,
            _viewMap: viewMap
        };

        var source = <any>WinJS.UI.Pages;
        (<any>WinJS.Namespace)._moduleDefine(_Pages, null, pageOverride);
        source.get = pageOverride.get;
        source.define = pageOverride.define;
        source.render = pageOverride.render;
        source._remove = pageOverride._remove;

		//replaces HtmlControl, otherwise it does not use proper Page constructor
		WinJS.UI.HtmlControl = WinJS.Class.define(function HtmlControl_ctor(element, options, complete) {
			/// <signature helpKeyword="WinJS.UI.HtmlControl.HtmlControl">
			/// <summary locid="WinJS.UI.HtmlControl.constructor">
			/// Initializes a new instance of HtmlControl to define a new page control.
			/// </summary>
			/// <param name="element" locid="WinJS.UI.HtmlControl.constructor_p:element">
			/// The element that hosts the HtmlControl.
			/// </param>
			/// <param name="options" locid="WinJS.UI.HtmlControl.constructor_p:options">
			/// The options for configuring the page. The uri option is required in order to specify the source
			/// document for the content of the page.
			/// </param>
			/// </signature>
			WinJS.UI.Pages.render(options.uri, element, options).
				then(complete, function () { complete(); });
		})

    })(WinJSContrib.UI.Pages, __global, WinJS, WinJS.UI.Pages, WinJS.Utilities, WinJS.Utilities, profiler, WinJS.Promise, WinJS.UI.Fragments, WinJS.UI);


}