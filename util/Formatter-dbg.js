/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
jQuery.sap.declare("fin.gl.glview.display.util.Formatter");
fin.gl.glview.display.util.Formatter = {
		formatAmount : function(amount, currency) {
			if(!currency){
				// hide currency control, if currency is not maintained
				this.addStyleClass("hidden");
			} else {
				// align currency control
				this.addStyleClass("position");
			}
			// return amount as float value for currency control
			return parseFloat(amount);
		}
};