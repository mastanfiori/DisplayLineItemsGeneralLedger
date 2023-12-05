/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
jQuery.sap.declare("fin.gl.glview.display.util.Status");
fin.gl.glview.display.util.Status = (function(){

	// -------------------------------------------
	// COMMON SUPER CLASS: oStatus
	// -------------------------------------------

	function Status(oController, sStatusName) {
		this.oController = oController;
		this.statusName = sStatusName;
		this.fromDate = false;
		this.toDate = false;
		this.keyDate = "";
		this.exRateDate = "";
		this.exRateType = "";
		this.dispCur = "";
	}

	// methods to be implemented by each subclass

	Status.prototype.updateDates = function() { return undefined; };

	Status.prototype.getFilters = function() { return undefined; };

	Status.prototype.isValid = function() { return undefined; };

	// define the default sorting hierarchy for each request
	Status.prototype.getSorter = function() {
		var aSorter = [];
		aSorter.push(new sap.ui.model.Sorter("AssignmentReference", false, true));
		aSorter.push(new sap.ui.model.Sorter("AccountingDocument", false, true));
		return aSorter;
	};

	// get the current values of the custom filter fields, depending on the status
	// needed for variant management
	Status.prototype.getCustomFields = function() {
		this.updateDates();

		var oExRateDate = null;
		var oExRateType = null;
		var oDispCur = null;
		if (this.oController.isFieldInFilterItems(this.oController.getView().byId("fin.gl.glview.display.smartfilterbar"), "DisplayCurrency")) {
			oDispCur = this.dispCur;
		}
		if (this.oController.isFieldInFilterItems(this.oController.getView().byId("fin.gl.glview.display.smartfilterbar"), "ExchangeRateType")) {
			oExRateType = this.exRateType;
		}
		if (this.oController.isFieldInFilterItems(this.oController.getView().byId("fin.gl.glview.display.smartfilterbar"), "ExchangeRateDate")) {
			oExRateDate = this.exRateDate;
		}

		return {
			status: this.statusName, // is in BASIC
			fromDate: this.fromDate, // is in BASIC
			toDate: this.toDate,     // is in BASIC
			keyDate: this.keyDate,   // is in BASIC
			exRateDate: oExRateDate, // is in ADVANCED, just return value, if selected
			exRateType: oExRateType, // is in ADVANCED, just return value, if selected
			dispCur: oDispCur        // is in ADVANCED, just return value, if selected
		};
	};

	// -------------------------------------------
	// CLASS FOR STATUS OPEN: StatusOpen
	// -------------------------------------------

	function StatusOpen(oController) {
		// constructor
		this.base = Status;
		this.base(oController, "Open");
	}

	StatusOpen.prototype = new Status();

	// update the internal date variables & parameters with the current values
	StatusOpen.prototype.updateDates = function() {
		this.keyDate = this.oController.getView().byId("fin.gl.glview.display.sfb.KDpicker").getDateValue();
		this.exRateDate = this.oController.getView().byId("fin.gl.glview.display.sfb.ExRateDatePicker").getDateValue();
		this.exRateType = this.oController.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput").getValue();
		this.dispCur = this.oController.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput").getValue();
	};

	// get the current custom filter values for the status 'Open'
	// add these values to the filter array
	StatusOpen.prototype.getFilters = function() {

		var aFilterItems = [];
		this.updateDates();

		// add filter regarding Open Item Management
		if(this.oController.getView().byId("fin.gl.glview.display.sfb.XOPVWselect").getSelectedKey() === "DDLB_EXCLUDE"){
			aFilterItems.push(new sap.ui.model.Filter("IsOpenItemManaged", sap.ui.model.FilterOperator.EQ, "X"));
		}

		// transform key date filter into Posting Date and Clearing Date filter
		// done via key date parameters within the view layer

		// add filter regarding the item type
		// nothing to do anymore

		return aFilterItems;

	};

	// determine whether all custom filters are filled correctly for the status 'Open'
	// if not, raise message
	StatusOpen.prototype.isValid = function() {

		this.updateDates();

		if(!this.keyDate){
			// message: key date missing
			this.oController.oCustomErrorMessages.push({
				code:    this.oController.textBundle.getText("ER_SEARCH"),
				type:    "Error",
				message: this.oController.textBundle.getText("ERD1_KEYDATE")
			});
			// provide messages
			this.oController.onMessagePopoverPressed(this.oController.getView().byId("fin.gl.glview.display.footer.button.alert"));
			return false;
		} else {
			return true;
		}

	};

	// -------------------------------------------
	// CLASS FOR STATUS CLEARED: StatusCleared
	// -------------------------------------------

	function StatusCleared(oController) {
		// constructor
		this.base = Status;
		this.base(oController, "Cleared");
	}

	StatusCleared.prototype = new Status();

	// update the internal date variables & parameters with the current values
	StatusCleared.prototype.updateDates = function() {
		this.keyDate = this.oController.getView().byId("fin.gl.glview.display.sfb.KDpicker").getDateValue();
		this.exRateDate = this.oController.getView().byId("fin.gl.glview.display.sfb.ExRateDatePicker").getDateValue();
		this.exRateType = this.oController.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput").getValue();
		this.dispCur = this.oController.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput").getValue();
	};

	// get the current custom filter values for the status 'Cleared'
	// add these values to the filter array
	StatusCleared.prototype.getFilters = function() {

		var aFilterItems = [];
		this.updateDates();

		// transform key date filter into Posting Date and Clearing Date filter
		// done via key date parameters within the view layer

		// add filter regarding the item type
		// nothing to do anymore

		return aFilterItems;

	};

	// determine whether all custom filters are filled correctly for the status 'Cleared'
	// if not, raise message
	StatusCleared.prototype.isValid = function() {

		var oToDate = null;
		var oKeyDate = null;

		this.updateDates();
		if(this.keyDate !== null && this.keyDate !== undefined && this.keyDate !== ""){
			oKeyDate = this.keyDate;
		}

		// get toDate
		var clearingDateFilter = this.oController.getView().byId("fin.gl.glview.display.smartfilterbar").getFilters(["ClearingDate"]);

		if(clearingDateFilter && clearingDateFilter[0] && clearingDateFilter[0].aFilters[0] && clearingDateFilter[0].aFilters[0].oValue2){
			oToDate = clearingDateFilter[0].aFilters[0].oValue2;
		} else if (clearingDateFilter && clearingDateFilter[0] && clearingDateFilter[0].aFilters[0] && clearingDateFilter[0].aFilters[0].oValue1 &&
				clearingDateFilter[0].aFilters[0].sOperator === "LE"){
			oToDate = clearingDateFilter[0].aFilters[0].oValue1;
		} else if (clearingDateFilter && clearingDateFilter[0] && clearingDateFilter[0].oValue2){
			oToDate = clearingDateFilter[0].oValue2;
		} else if (clearingDateFilter && clearingDateFilter[0] && clearingDateFilter[0].oValue1 && clearingDateFilter[0].sOperator === "LE"){
			oToDate = clearingDateFilter[0].oValue1;
		}

		if((oKeyDate >= oToDate) && (oToDate !== null)) {
			// message: key date does not fit
			this.oController.oCustomErrorMessages.push({
				code:    this.oController.textBundle.getText("ER_SEARCH"),
				type:    "Error",
				message: this.oController.textBundle.getText("ERD2_KEYDATE")
			});
			// provide messages
			this.oController.onMessagePopoverPressed(this.oController.getView().byId("fin.gl.glview.display.footer.button.alert"));
			return false;
		} else {
			return true;
		}

	};

	// -------------------------------------------
	// CLASS FOR STATUS ALL: StatusAll
	// -------------------------------------------

	function StatusAll(oController) {
		// constructor
		this.base = Status;
		this.base(oController, "All");
	}

	StatusAll.prototype = new Status();

	// update the parameters with the current values
	StatusAll.prototype.updateDates = function() {
		this.exRateDate = this.oController.getView().byId("fin.gl.glview.display.sfb.ExRateDatePicker").getDateValue();
		this.exRateType = this.oController.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput").getValue();
		this.dispCur = this.oController.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput").getValue();
	};

	// get the current custom filter values for the status 'All'
	// add these values to the filter array
	StatusAll.prototype.getFilters = function() {

		var aFilterItems = [];
		this.updateDates();

		// add filters regarding the item type
		// nothing to do anymore

		return aFilterItems;

	};

	// determine whether all custom filters are filled correctly for the status 'All'
	// if not, raise message
	StatusAll.prototype.isValid = function() {
		return true;
	};

	// -------------------------------------------
	// RETURN: Status
	// -------------------------------------------

	return {
		StatusOpen: StatusOpen,
		StatusCleared: StatusCleared,
		StatusAll: StatusAll
	};

})();