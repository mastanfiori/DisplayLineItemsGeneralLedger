/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device",
	"fin/gl/glview/display/model/models"
], function(UIComponent, Device, models) {
	"use strict";

	return UIComponent.extend("fin.gl.glview.display.Component", {

		metadata: {
			manifest: "json"
		},

		/**
		 * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
		 * @public
		 * @override
		 */
		init: function() {
			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);

			// set the device model
			this.setModel(models.createDeviceModel(), "device");
		},

		getContentDensityClass : function() {
			if (this._sContentDensityClass === undefined) {
				// check whether FLP has already set the content density class; do nothing in this case
				if (jQuery(document.body).hasClass("sapUiSizeCozy") || jQuery(document.body).hasClass("sapUiSizeCompact")) {
					this._sContentDensityClass = "";
				} else {
					// store "sapUiSizeCompact" or "sapUiSizeCozy" in this._sContentDensityClass, depending on which modes are supported by the app
					// e.g. the "cozy" class in case sap.ui.Device.support.touch is "true" and "compact" otherwise
					this._sContentDensityClass = sap.ui.Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
				}
			}
			return this._sContentDensityClass;
		}

	});

});