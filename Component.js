/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(["sap/ui/core/UIComponent","sap/ui/Device","fin/gl/glview/display/model/models"],function(U,D,m){"use strict";return U.extend("fin.gl.glview.display.Component",{metadata:{manifest:"json"},init:function(){U.prototype.init.apply(this,arguments);this.setModel(m.createDeviceModel(),"device");},getContentDensityClass:function(){if(this._sContentDensityClass===undefined){if(jQuery(document.body).hasClass("sapUiSizeCozy")||jQuery(document.body).hasClass("sapUiSizeCompact")){this._sContentDensityClass="";}else{this._sContentDensityClass=sap.ui.Device.support.touch?"sapUiSizeCozy":"sapUiSizeCompact";}}return this._sContentDensityClass;}});});
