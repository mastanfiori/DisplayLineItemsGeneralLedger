/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"fin/gl/glview/display/util/Status",                        // to create instance of status object (all / open / cleared)
	"fin/gl/glview/display/util/Formatter",                     // to enable formatter file
	"sap/ui/generic/app/navigation/service/NavigationHandler",  // to create instance of central navigation handler
	"sap/ui/generic/app/navigation/service/SelectionVariant",   // to create instance of selection variant
	"sap/ui/generic/app/navigation/service/NavType",            // to enable navigation type access
	"sap/ui/core/IconPool",                                     // to enable icon pool access
	"sap/ui/core/ListItem",                                     // to enable list item access
	"sap/m/MessageBox"                                          // message box for info message(s)
], function(Controller, JSONModel, Status, Formatter, NavigationHandler, SelectionVariant, NavType, IconPool, ListItem, MessageBox) {
	"use strict";
	return Controller.extend("fin.gl.glview.display.controller.Main", {

		// ---------------------------------------------
		// GLOBAL VARS
		// ---------------------------------------------

		entitySetF4L: "/I_Ledger",                              // entity set for the ledger value help
		sLeadingLedger: "",                                     // used to store the leading ledger

		entitySetF4ERT: "/I_ExchangeRateType",                  // entity set for the exchange rate type suggestions
		aExRateSuggestionItems: [],                             // used to store the exchange rate type suggestions
		bIsExRateRequestTriggered: false,                       // indicator - was exchange rate type data already requested?

		entitySetF4DC: "/I_Currency",                           // entity set for the display currency suggestions
		aDispCurSuggestionItems: [],                            // used to store the display currency suggestions
		bIsDispCurRequestTriggered: false,                      // indicator - was display currency data already requested?

		textBundle: {},                                         // used to store the text variables of the i18n file

		oStatus: {},                                            // used to store the current status instance (all / open / cleared)

		oNavigationHandler: {},                                 // used to store the central navigation handler instance

		oShareActionSheet: null,                                // used to store instance of share dialog

		bIsControllerInitialized: false,                        // indicator - was controller initialized?
		bIsMetadataLoaded: false,                               // indicator - was meta data document loaded?
		bIsFilterBarInitialized: false,                         // indicator - was filter bar initialized?
		bIsLeadingLedgerFetchedAlready: false,                  // indicator - was leading ledger fetched at least one time?

		bIsSFBTriggeredDueToInitialization: false,              // indicator - was filter bar variant selected via application state handling?
		bIsSTBTriggeredDueToInitialization: false,              // indicator - was table layout variant selected via application state handling?

		bIsInitialSearchTriggered: false,                       // indicator - was search triggered at least one time?
		bIsPreviousSearchTriggeredBeforeNavWasEvaluated: false, // indicator - was previous search triggered, before the navigation was evaluated?
		bIsSearchValid: true,                                   // indicator - was custom search criteria valid?
		bIsCurrentSearchGrouped: true,                          // indicator - was grouping set at smart table, before search was triggered?

		bIsPossibleErrorTriggeredByUser: true,                  // indicator - was error triggered by new user interaction?
		oMessagePopover: "",                                    // messaging pop up instance
		oCustomErrorMessages: [],                               // container for custom error messages

		oAvailableCurrencies: {},                               // available currencies from TCURX of frontend server

		oRowDetailsPopover: "",                                 // row details pop up instance
		oRowContext: "",                                        // context of selected row (for details)

		// ---------------------------------------------
		// APPLICATION INITIALIZATION / NAVIGATION
		// ---------------------------------------------

		onBeforeRendering : function() {
			// set form factor for smart table
			var sCozyClass = "sapUiSizeCozy", sCompactClass = "sapUiSizeCompact", sCondensedClass = "sapUiSizeCondensed";
			if (jQuery(document.body).hasClass(sCompactClass) || this.getOwnerComponent().getContentDensityClass() === sCompactClass) {
				this.getView().byId("fin.gl.glview.display.smarttable").addStyleClass(sCondensedClass);
			} else if (jQuery(document.body).hasClass(sCozyClass) || this.getOwnerComponent().getContentDensityClass() === sCozyClass) {
				this.getView().byId("fin.gl.glview.display.smarttable").addStyleClass(sCozyClass);
			}
		},

		onInit : function() {

			// set busy during initialization
			this.getView().setBusy(true);

			// set text bundle
			this.textBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();

			// set navigation handler
			this.oNavigationHandler = new NavigationHandler(this);

			// handle overlay
			this.getView().byId("fin.gl.glview.display.smarttable").attachShowOverlay(function(oEvent){
				if(!this.bIsInitialSearchTriggered){
					// do not show the overlay, if no search was triggered yet
					oEvent.getParameter("overlay").show = false;
				}
			}.bind(this));

			// handle table data
			this.getView().byId("fin.gl.glview.display.smarttable").attachDataReceived(function(oEvent){
				// only show row count, if data was received
				oEvent.getSource().setShowRowCount(true);
			});

			// initialize oStatus
			this.oStatus = new fin.gl.glview.display.util.Status.StatusOpen(this); // default is open items

			// toggle controlling area visibility
			this._toggleControllingAreaVisibility(this);

			// initialize key date & parameters for display currency and table
			this.getView().byId("fin.gl.glview.display.sfb.KDpicker").setDateValue(new Date()); // default is today
			this.getView().byId("fin.gl.glview.display.sfb.ExRateDatePicker").setDateValue(new Date()); // default is today
			this.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput").setValue("M"); // default is M
			//this.getView().byId("fin.gl.glview.display.sfb.ExpandLevelInput").setSelectedKey("L0"); // default is L0

			// attach error handler - success EQ false
			this.getOwnerComponent().getModel().attachRequestCompleted(function(oEvent){
				if(oEvent.getParameter("url").indexOf("C_JournalEntryItemBrowser") !== -1){
					var oTableObject = this.getView().byId("fin.gl.glview.display.analyticaltable");
					// remove overlay, if a table request is back
					oTableObject.setShowOverlay(false);
					// handle details button enablement, if a table request is back
					this._setDetailsButttonEnablement(oTableObject);
				}
				if(oEvent.getParameter("success") === false){

					if(oEvent.getParameter("url").indexOf("C_JournalEntryItemBrowser") !== -1){
						if(!oEvent.getParameter("response") || (oEvent.getParameter("response") && oEvent.getParameter("response").statusText !== "abort")){

							// stop busy indicator of smart table in case it's running
							this.getView().byId("fin.gl.glview.display.smarttable").setBusy(false);

							// stop busy indicator of analytical table in case it's running
							var oTable = this.getView().byId("fin.gl.glview.display.analyticaltable");
							oTable.setEnableBusyIndicator(false);
							oTable.setBusy(false);

							// set noData
							// handled by smart table

						} // else do not stop busy indicator, if no 'real' error occurred
					} // else do not stop busy indicator, if the request was not triggered for the table

					// handle exception - if there is a response and no abort message (and just if there was a new user interaction, after the error pop up was closed the last time)
					if((oEvent.getParameter("response")) && (oEvent.getParameter("response").statusText !== "abort") && (this.bIsPossibleErrorTriggeredByUser)){
						this._handleMessaging();
					}

					return;

				}
			}.bind(this));

			// create JSON model 'page' and assign it
			var oPageModel = new JSONModel();
			oPageModel.setProperty("/headerExpanded", true); // filter bar is shown by default
			oPageModel.setProperty("/numberOfMessages", 0); // before initialization was finished, no error messages are shown
			this.getView().setModel(oPageModel, "page");

			// create message pop-up
			this.oMessagePopover = new sap.m.MessagePopover({
				items: {
					path: "messaging>/",
					template: new sap.m.MessagePopoverItem({
						description: "{messaging>message}",
						type:        "{messaging>type}",
						title:       "{messaging>code}"
					})
				}
			});

			// assign message model
			this.getView().setModel(sap.ui.getCore().getMessageManager().getMessageModel(), "message");

			// create messaging model for application and assign it
			var oMessagingModel = new JSONModel();
			oMessagingModel.setData(this.getView().getModel("message").getData());
			this.oMessagePopover.setModel(oMessagingModel, "messaging");
			this.getView().setModel(oMessagingModel, "messaging");

			// register on successfully loaded meta data
			this.getOwnerComponent().getModel().getMetaModel().loaded().then(function() {

				this.bIsMetadataLoaded = true; // flag is used to control the timing of application state initialization (see initAppState)

				// we need to make sure, that the value help annotations for CompanyCode are loaded for the FiscalDateRangeType,
				// otherwise the $filter parameter for the FiscalDateRangeType request is not filled correctly, because of missing type information
				if(!this.getOwnerComponent().getModel().getMetaModel().getODataEntitySet("I_LedgerCompanyCodeVH")){
					var oContext = this.getOwnerComponent().getModel().getMetaModel().getMetaContext("/C_JournalEntryItemBrowserResults/CompanyCode");
					this.oCompanyCodeEntitySetPromise = this.getOwnerComponent().getModel().getMetaModel().getODataValueLists(oContext);
				}

				// trigger initAppState()
				this.initAppState();

			}.bind(this));

			// set form factor for view, depending on FLP settings
			this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());

			// set groupHeaderFormatter for date columns
			this._setGroupHeaderFormatter();

			// get available currency definitions
			this.oAvailableCurrencies = sap.ui.getCore().getConfiguration().getFormatSettings().getCustomCurrencies();

			/**
			 * @ControllerHook onInit of the "sap.ui.core.mvc.Controller"
			 * Implement this hook, if you want to do something when the controller is initialized.
			 * @callback sap.ui.core.mvc.Controller~extHookOnInit
			 */
			if(this.extHookOnInit){
				this.extHookOnInit();
			}

			this.bIsControllerInitialized = true; // flag is used to control the timing of application state initialization (see initAppState)

		},

		_handleMessaging : function() {

			// get message model data
			var oMessageModel = this.getView().getModel("message");
			var oMessagingModel = this.getView().getModel("messaging");
			var aMessageData = oMessageModel.getData();
			var aMessagingData = [];
			var iLength = aMessageData.length - 1;

			// set up messaging model, with necessary messages from message model
			for(var i = iLength; i > -1; i--){
				if(((aMessageData[i].message.indexOf("An exception was raised") !== -1) && !aMessageData[i].description) ||
						(!aMessageData[i].message && !aMessageData[i].description) ||
						(aMessageData[i].target.indexOf("I_FiscalCalendarDtePrevPeriods") !== -1)){
					// do not provide such messages
					aMessageData.splice(i,1);
				} else {
					// set up application messaging model
					aMessagingData.push({
						code:    aMessageData[i].code,
						type:    aMessageData[i].type,
					 // message: this._formatErrorMessage(aMessageData[i].message, aMessageData[i].description, aMessageData[i].target)
						message: this.textBundle.getText("ERROR_MES",[aMessageData[i].message,decodeURIComponent(aMessageData[i].target)])
					});
				}
			}

			// set up messaging model, with custom error messages
			for(var x = 0; x < this.oCustomErrorMessages.length; x++){
				aMessagingData.push({
					code:    this.oCustomErrorMessages[x].code,
					type:    this.oCustomErrorMessages[x].type,
					message: this.oCustomErrorMessages[x].message
				});
			}

			// provide messages
			oMessagingModel.setData(aMessagingData);
			this.getView().getModel("page").setProperty("/numberOfMessages", aMessagingData.length);

		},

		onAfterRendering : function() {

			// disabled to allow app variants to set specific title
/*			var sTitle = this.textBundle.getText("FULLSCREEN_TITLE_NEWII");

			// set application full screen title
			this.getOwnerComponent().getService("ShellUIService").then(
				function(oShellUIService) {
					if(oShellUIService){
						oShellUIService.setTitle(sTitle);
					}
				},
				function(oError) {
					// error occurred
				}
			);*/

		},

		onInitFilterBar : function(oEvent) {

			var oSmartFilterBar = this.getView().byId("fin.gl.glview.display.smartfilterbar");
//			var aFilterItems = oSmartFilterBar.getFilterGroupItems();

//			// 'hide' date fields -> default is open items
            var oFilterItem = oSmartFilterBar.determineFilterItemByName("PostingDate");
            if (oFilterItem) {
                oFilterItem.setVisible(true);
                oFilterItem.setVisibleInFilterBar(false);
            }
            oFilterItem = oSmartFilterBar.determineFilterItemByName("ClearingDate");
            if (oFilterItem) {
                oFilterItem.setVisible(true);
                oFilterItem.setVisibleInFilterBar(false);
            }
//			// 'hide' expand level parameter by default, as the default is 0
            //oFilterItem = oSmartFilterBar.determineFilterItemByName("LevelSelection");
            //if (oFilterItem) {
            //    oFilterItem.setVisible(true);
            //    oFilterItem.setVisibleInFilterBar(false);
            //}

            // set default ledger
			this._setDefaultLedgerInUI(this);

			this.bIsFilterBarInitialized = true;  // flag is used to control the timing of application state initialization (see initAppState)

			// trigger initAppState()
			this.initAppState();

		},

		initAppState : function() {

			// build up mock data
			// ------------------------
			var oAppDataMock = {};
			var oURLParamsMock = {};
			var sNavTypeMock = "";

			if(jQuery.sap.getUriParameters().get("responderOn") && jQuery.sap.getUriParameters().get("parametersProvided")){
				var sSelectionVariant = '{"Version":{"Major":"1","Minor":"0","Patch":"0"},"SelectionVariantID":"","Text":"Selection Variant with ID ",' +
					'"ODataFilterExpression":"","Parameters":[],"SelectOptions":' + 
					'[{"PropertyName":"ControllingArea","Ranges":[{"Sign":"I","Option":"EQ","Low":"' + jQuery.sap.getUriParameters().get("ControllingArea") + '","High":null}]},' + 
					'{"PropertyName":"ProfitCenter","Ranges":[{"Sign":"I","Option":"EQ","Low":"' + jQuery.sap.getUriParameters().get("ProfitCenter") + '","High":null}]}]}';
				var oSelectionVariant = new SelectionVariant(sSelectionVariant);
				oAppDataMock = {
					bNavSelVarHasDefaultsOnly: false,
					oDefaultedSelectionVariant: {_mParameters: {}, _mSelectOptions: {}, _sId: ""},
					oSelectionVariant: oSelectionVariant,
					selectionVariant: oSelectionVariant.toJSONString()
				};
				oURLParamsMock = {
					ControllingArea: [jQuery.sap.getUriParameters().get("ControllingArea")],
					ProfitCenter: [jQuery.sap.getUriParameters().get("ProfitCenter")]
				};
				sNavTypeMock = "URLParams";
			}
			// ------------------------

			this.getView().setBusy(false); // stop initial busy
			this.getView().setBusy(true); // set UI to busy during complex nav initialization logic

			if(!this.bIsMetadataLoaded || !this.bIsControllerInitialized || !this.bIsFilterBarInitialized || !this.bIsLeadingLedgerFetchedAlready){
				return;
			}

			this.getView().setBusy(false); // release busy

			var oParseNavigationPromise = this.oNavigationHandler.parseNavigation();
			oParseNavigationPromise.done(function(oAppData, oURLParameters, sNavType) {
				if(!this.getOwnerComponent().getModel().getMetaModel().getODataEntitySet("I_LedgerCompanyCodeVH")){
					this.oCompanyCodeEntitySetPromise.then(function() {
						// execute navigation coding, depending on the navigation type
						if(jQuery.sap.getUriParameters().get("responderOn") && jQuery.sap.getUriParameters().get("parametersProvided")){
							this.handleNavigation(oAppDataMock, oURLParamsMock, sNavTypeMock, true);
						} else {
							this.handleNavigation(oAppData, oURLParameters, sNavType);
						}
					}.bind(this));
				} else {
					// execute navigation coding, depending on the navigation type
					if(jQuery.sap.getUriParameters().get("responderOn") && jQuery.sap.getUriParameters().get("parametersProvided")){
						this.handleNavigation(oAppDataMock, oURLParamsMock, sNavTypeMock, true);
					} else {
						this.handleNavigation(oAppData, oURLParameters, sNavType);
					}
				}
			}.bind(this));

			oParseNavigationPromise.fail(function(oError) {
				this.oCustomErrorMessages.push({
					code:    this.textBundle.getText("INBOUND_NAV_ERROR"),
					type:    "Error",
					message: this.textBundle.getText("INBOUND_NAV_ERROR")
				});
				// provide messages
				this.onMessagePopoverPressed(this.getView().byId("fin.gl.glview.display.footer.button.alert"));
			}.bind(this));

		},

		_handleSelectionVariant : function(oAppDataIn, oSmartFilterBar, bHasOnlyDefaults, bUseUserDefinedTableVariantIn) {

			var oAppData = oAppDataIn;
			var bUseUserDefinedTableVariant = bUseUserDefinedTableVariantIn;

			// get selection variant as correctly formatted object
			oAppData.selectionVariant = JSON.stringify(this._formatSelectionVariant(JSON.parse(oAppData.selectionVariant)));
			var oSelectionVariant = new SelectionVariant(oAppData.selectionVariant);
			var oSemanticDates = {};
			if (oAppData.semanticDates && (typeof oAppData.semanticDates === "string")) {
				oSemanticDates = JSON.parse(oAppData.semanticDates);
			}
			var oUiState = new sap.ui.comp.state.UIState({
				selectionVariant: JSON.parse(oAppData.selectionVariant),
				semanticDates: oSemanticDates
			});
			var mUiStateProperties = {
				replace: true,
				strictMode: false
			};

			// get properties of selection variant
			var aSelectionVariantProperties = oSelectionVariant.getParameterNames().concat(
				oSelectionVariant.getSelectOptionsPropertyNames());

			if (!bHasOnlyDefaults || oSmartFilterBar.isCurrentVariantStandard()) {
				// fade in all properties in visible filter bar area
				for (var k = 0; k < aSelectionVariantProperties.length; k++) {
					oSmartFilterBar.addFieldToAdvancedArea(aSelectionVariantProperties[k]);
				}
				// a default variant could be loaded; we have to clear the variant and we have to clear all the selections
				// in the filter bar
				// avoid this, if just user default values are provided -> default variant 'wins'
				// but apply the following also for user default values, if no default variant was loaded -> isCurrentVariantStandard
				oSmartFilterBar.clearVariantSelection();
				oSmartFilterBar.clear();
			//	oSmartFilterBar.setDataSuiteFormat(oAppData.selectionVariant, true);
				oSmartFilterBar.setUiState(oUiState, mUiStateProperties);

				// set the leading ledger as default again, if the selection variant has not provided a ledger value
				if(oSmartFilterBar.getFilterData() && !oSmartFilterBar.getFilterData().Ledger){
					this._setDefaultLedgerInUI(this);
				}
			}

			// special fields for navigation (check select options and parameters)
			if ( ( oSelectionVariant.getSelectOption("SelectUserDefaultLayoutVariant") !== undefined &&
				   ( oSelectionVariant.getSelectOption("SelectUserDefaultLayoutVariant")[0].Low === true || 
						   oSelectionVariant.getSelectOption("SelectUserDefaultLayoutVariant")[0].Low === "true" ) ) || 
				 ( oSelectionVariant.getParameter("SelectUserDefaultLayoutVariant") !== undefined &&
				   ( oSelectionVariant.getParameter("SelectUserDefaultLayoutVariant") === true || 
						   oSelectionVariant.getParameter("SelectUserDefaultLayoutVariant") === "true" ) ) ) { // string for parameters
				bUseUserDefinedTableVariant = true;
			}
			if ( ( oSelectionVariant.getSelectOption("SelectOnlyOIMAccounts") !== undefined &&
				   ( oSelectionVariant.getSelectOption("SelectOnlyOIMAccounts")[0].Low === false || 
						   oSelectionVariant.getSelectOption("SelectOnlyOIMAccounts")[0].Low === "false" ) ) ||
				 ( oSelectionVariant.getParameter("SelectOnlyOIMAccounts") !== undefined &&
				   ( oSelectionVariant.getParameter("SelectOnlyOIMAccounts") === false || 
						   oSelectionVariant.getParameter("SelectOnlyOIMAccounts") === "false" ) ) ) { // string for parameters
				oAppData.customData.IsOpenItemManagedFlag = "DDLB_INCLUDE";
			}
			if ( oSelectionVariant.getSelectOption("DisplayCurrency") !== undefined &&
				oSelectionVariant.getSelectOption("DisplayCurrency")[0].Low !== undefined ){
					oAppData.customData.DisplayCurrency = oSelectionVariant.getSelectOption("DisplayCurrency")[0].Low;
			} else if(oSelectionVariant.getParameter("DisplayCurrency") !== undefined){
					oAppData.customData.DisplayCurrency = oSelectionVariant.getParameter("DisplayCurrency");
			}
			var aSelOptions = oSelectionVariant.getSelectOption("SelectForOpenAtKeydate");
			if (aSelOptions !== undefined && aSelOptions[0].Option === "EQ" && aSelOptions[0].Low) {
				oAppData.customData.ItemStatus = "Open";
				oAppData.customData.KeyDate = aSelOptions[0].Low;
			}

			return {
				oAppData : oAppData,
				bUseUserDefinedTableVariant : bUseUserDefinedTableVariant
			};

		},

		handleNavigation : function(oAppDataIn, oUrlParams, sNavType, bIsMock) {

			if (sNavType === NavType.initial) {
				return; // nothing to do
			}

			var oSmartFilterBar = this.getView().byId("fin.gl.glview.display.smartfilterbar");
			var bHasOnlyDefaults = oAppDataIn && oAppDataIn.bNavSelVarHasDefaultsOnly;
			// in case of navigation from another application via xAppState or URLParams, the user defined default variant
			// for the table shall not be applied, but the standard variant shall be shown ...
			// Reason: the table variant might contain filters, which change the total sum, which might lead to confusion
			// Solution: the calling application can explicitly request to use the user defined table variant via the property SelectUserDefaultLayoutVariant
			// of the SelectionVariant
			var bUseUserDefinedTableVariant = false;

			var oAppData = oAppDataIn || {};
			oAppData.customData = oAppDataIn.customData || {};
			if (bHasOnlyDefaults) {
				// if there are only default values, the status setting from standard or default variant should 'win'
				// CAUTION: if the navKey format is used, bHasOnlyDefaults is also true (handled explicitly)
				oAppData.customData.ItemStatus = this.oStatus.getCustomFields().status;
			}

			if (sNavType === NavType.xAppState && oAppData.useNavKeyFormat === true) { // private navigation key scenario

				// set standard variant and get filter values from navKey format
				this.bIsSFBTriggeredDueToInitialization = true;
				oSmartFilterBar.setCurrentVariantId("*standard*");
				var oFilterData = this._getFilterDataFromNavKeyFormat(oAppData);
				oSmartFilterBar.setFilterData(oFilterData, true);

				// status has to be 'all' for navigation cases
				oAppData.customData.ItemStatus = "All";

		        // make all fields visible that are filled:
				var aSmbFilterData = [];
				for (var i in oFilterData) {
					if (i && oFilterData[i]) {
						aSmbFilterData.push([i, oFilterData[i]]);
					}
				}
				for (var j = 0; j < aSmbFilterData.length; j++) {
					if ((aSmbFilterData[j][0] !== "_CUSTOM") && (aSmbFilterData[j][0] !== "sap-ushell-defaultedParameterNames")) {
						oSmartFilterBar.addFieldToAdvancedArea(aSmbFilterData[j][0]);
					}
				}

			} else if (oAppData.selectionVariant) { // standard scenario

				var oResult = this._handleSelectionVariant(oAppData, oSmartFilterBar, bHasOnlyDefaults, bUseUserDefinedTableVariant);
				oAppData = oResult.oAppData;
				bUseUserDefinedTableVariant = oResult.bUseUserDefinedTableVariant;

			}

			// set the table variant
			var oSmartTable = this.getView().byId("fin.gl.glview.display.smarttable");
			if (oAppData.tableVariantId) {
				// an explicit table variant is provided
				this.bIsSTBTriggeredDueToInitialization = true;
				oSmartTable.setCurrentVariantId(oAppData.tableVariantId);
			} else if ((sNavType === NavType.iAppState || sNavType === NavType.xAppState || sNavType === NavType.URLParams)
					&& !bUseUserDefinedTableVariant && (!bHasOnlyDefaults || oAppData.useNavKeyFormat === true)) {
				// no table variant was provided, we have a standard navigation scenario without 'defaults only' or instead the navigation key scenario
				// and the default variant was not requested -> prevent the default variant
				this.bIsSTBTriggeredDueToInitialization = true;
				oSmartTable.setCurrentVariantId("*standard*");
			}
			if (oAppData.customData.SmartTableState && oAppData.customData.SmartTableState.isTableVariantDirty && oAppData.customData.SmartTableState.tablePresentationVariant) { // the stored variant contained unsaved settings
				var oSmartTableUiState = new sap.ui.comp.state.UIState({
					selectionVariant: JSON.parse(oAppData.customData.SmartTableState.tableSelectionVariant),
					presentationVariant: JSON.parse(oAppData.customData.SmartTableState.tablePresentationVariant)
				});
				oSmartTable.setUiState(oSmartTableUiState); // set unsaved table settings on top of applied variant
			}

			if ((sNavType === NavType.iAppState || sNavType === NavType.xAppState || sNavType === NavType.URLParams)
					&& (!bHasOnlyDefaults || oAppData.useNavKeyFormat === true)) {
				// restore the custom fields, if not just user default values are provided
				if (!oAppData.customData.ItemStatus) {
					oAppData.customData.ItemStatus = "All";
				}
				this.restoreCustomAppStateData(oAppData.customData, oSmartFilterBar);
			} else {
				// if there is a user default value for the display currency and the field was enabled,
				// set it explicitly, as it is a custom field
				if ((oAppData.customData.DisplayCurrency || oAppData.customData.DisplayCurrency === "") &&
					(this.isFieldInFilterItems(oSmartFilterBar, "DisplayCurrency"))) {
					this.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput").setValue(oAppData.customData.DisplayCurrency);
				}
			}

			// trigger the search, if search parameters other than the default values are provided
			if ((!bHasOnlyDefaults || oAppData.useNavKeyFormat === true) && (!bIsMock)) {
				if (oSmartFilterBar.isPending()) {
					this.getView().setBusy(true); // set UI busy while pending
					var fnSearchOnlyIfNotPending = function() {
						this.getView().setBusy(false); // release busy
						if (!this.bIsInitialSearchTriggered || this.bIsPreviousSearchTriggeredBeforeNavWasEvaluated) {
							this.getView().setBusy(true); // set UI busy while preparing direct nav search
							oSmartFilterBar.search();
							oSmartFilterBar.detachPendingChange(fnSearchOnlyIfNotPending);
						}
					}.bind(this);
					oSmartFilterBar.attachPendingChange(fnSearchOnlyIfNotPending);
				} else {
					oSmartFilterBar.search();
				}
			}

		},

		// ---------------------------------------------
		// LEADING LEDGER LOGIC
		// ---------------------------------------------

		_readLeadingLedgerFromBackend : function(oController) {

			// read the leading ledger from the database via oData call
			var oMyDeferred = jQuery.Deferred();
			// controller is needed in the success callback function of the oData call below
			var oCtrl = oController;

			// call the oData service for the ledger value help
			this.getView().getModel().read(this.entitySetF4L, {
				urlParameters : {
				},
				success : function(oData) {
					for(var i = 0; i < oData.results.length; i++){
						var bIsLeadingLedger = oData.results[i].IsLeadingLedger;
						if(bIsLeadingLedger === "X" || bIsLeadingLedger === true){
							// store the leading ledger as global attribute on the controller
							oCtrl.sLeadingLedger = oData.results[i].Ledger;
						}
					}
					oMyDeferred.resolve(oCtrl.sLeadingLedger);
				},
				error : function(oError) {
					jQuery.sap.log.error("Leading Ledger could not be determined via oData");
					if (oError && oError.response) {jQuery.sap.log.info(oError.response.statusText); } // e.g. internal server error
					if (oError)                    {jQuery.sap.log.info(oError.message); }             // e.g. HTTP request failed
					oMyDeferred.reject(oError);
				}
			});

			return oMyDeferred.promise();

		},

		_setDefaultLedgerInUI : function(oController) {

			var oSmartFilterBar = oController.getView().byId("fin.gl.glview.display.smartfilterbar");

			if (oController.sLeadingLedger === ""){
				// read the leading ledger from the database via oData call,
				// this fills the variable sLeadingLedger
				var oPromise = this._readLeadingLedgerFromBackend(oController);
				oPromise.done(function(sLeadingLedger){
					// set the default value only if the field is still empty
					if(oSmartFilterBar.getFilterData() && !oSmartFilterBar.getFilterData().Ledger){
						oSmartFilterBar.setFilterData({"Ledger" : sLeadingLedger}, false);
					}
					if(!this.bIsLeadingLedgerFetchedAlready){
						this.bIsLeadingLedgerFetchedAlready = true;  // flag is used to control the timing of application state initialization (see initAppState)
						// trigger initAppState()
						this.initAppState();
					}
				}.bind(this));
			} else {
				// set the leading ledger as default
				if(oSmartFilterBar.getFilterData() && !oSmartFilterBar.getFilterData().Ledger){
					oSmartFilterBar.setFilterData({"Ledger" : oController.sLeadingLedger}, false);
				}
			}

		},

		// ---------------------------------------------
		// EXCHANGE RATE TYPE LOGIC
		// ---------------------------------------------

		_readExchangeRateTypesFromBackend : function(oController) {

			// read the exchange rate types from the database via oData call
			var oMyDeferred = jQuery.Deferred();
			// controller is needed in the success callback function of the oData call below
			var oCtrl = oController;

			// call the oData service for the exchange rate type suggestions
			this.getView().getModel().read(this.entitySetF4ERT, {
				urlParameters : {
				},
				success : function(oData) {
					var aExRateSuggestionItems = [];
					for(var i = 0; i < oData.results.length; i++){
						var sId = "fin.gl.glview.display.smartfilterbar.exRate.sugItem" + i;
						var oSuggestionItem = new ListItem(sId, {
							key: oData.results[i].ExchangeRateType,
							text: oData.results[i].ExchangeRateType,
							additionalText: oData.results[i].ExchangeRateType_Text
						});
						aExRateSuggestionItems.push(oSuggestionItem);
					}
					// store the exchange rate type suggestions as global attribute on the controller
					oCtrl.aExRateSuggestionItems = aExRateSuggestionItems;
					oMyDeferred.resolve(oCtrl.aExRateSuggestionItems);
				},
				error : function(oError) {
					jQuery.sap.log.error("Exchange Rate Type suggestions could not be determined via oData");
					if (oError && oError.response) {jQuery.sap.log.info(oError.response.statusText); } // e.g. internal server error
					if (oError)                    {jQuery.sap.log.info(oError.message); }             // e.g. HTTP request failed
					oMyDeferred.reject(oError);
				}
			});

			return oMyDeferred.promise();

		},

		_fillExchangeRateSuggestions : function(oController) {

			var oExRate = oController.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput");

			if (oController.aExRateSuggestionItems.length === 0){
				// read the exchange rate types from the database via oData call,
				// this fills the variable aExRateSuggestionItems
				var oPromise = this._readExchangeRateTypesFromBackend(oController);
				oPromise.done(function(aExRateSuggestionItems){
					// add suggestion items to control
					oExRate.removeAllSuggestionItems();
					for (var n = 0; n < aExRateSuggestionItems.length; n++) {
						oExRate.addSuggestionItem(aExRateSuggestionItems[n]);
					}
				});
			} else {
				// add suggestion items to control
				oExRate.removeAllSuggestionItems();
				for (var n = 0; n < oController.aExRateSuggestionItems.length; n++) {
					oExRate.addSuggestionItem(oController.aExRateSuggestionItems[n]);
				}
			}

		},

		// ---------------------------------------------
		// DISPLAY CURRENCY LOGIC
		// ---------------------------------------------

		_readDisplayCurrenciesFromBackend : function(oController) {

			// read the display currencies from the database via oData call
			var oMyDeferred = jQuery.Deferred();
			// controller is needed in the success callback function of the oData call below
			var oCtrl = oController;

			// call the oData service for the display currency suggestions
			this.getView().getModel().read(this.entitySetF4DC, {
				urlParameters : {
				},
				success : function(oData) {
					var aDispCurSuggestionItems = [];
					for(var i = 0; i < oData.results.length; i++){
						var sId = "fin.gl.glview.display.smartfilterbar.dispCur.sugItem" + i;
						var oSuggestionItem = new ListItem(sId, {
							key: oData.results[i].Currency,
							text: oData.results[i].Currency,
							additionalText: oData.results[i].Currency_Text
						});
						aDispCurSuggestionItems.push(oSuggestionItem);
					}
					// store the display currency suggestions as global attribute on the controller
					oCtrl.aDispCurSuggestionItems = aDispCurSuggestionItems;
					oMyDeferred.resolve(oCtrl.aDispCurSuggestionItems);
				},
				error : function(oError) {
					jQuery.sap.log.error("Display Currency suggestions could not be determined via oData");
					if (oError && oError.response) {jQuery.sap.log.info(oError.response.statusText); } // e.g. internal server error
					if (oError)                    {jQuery.sap.log.info(oError.message); }             // e.g. HTTP request failed
					oMyDeferred.reject(oError);
				}
			});

			return oMyDeferred.promise();

		},

		_fillDisplayCurrencySuggestions : function(oController) {

			var oDispCur = oController.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput");

			if (oController.aDispCurSuggestionItems.length === 0){
				// read the display currencies from the database via oData call,
				// this fills the variable aDispCurSuggestionItems
				var oPromise = this._readDisplayCurrenciesFromBackend(oController);
				oPromise.done(function(aDispCurSuggestionItems){
					// add suggestion items to control
					oDispCur.removeAllSuggestionItems();
					for (var n = 0; n < aDispCurSuggestionItems.length; n++) {
						oDispCur.addSuggestionItem(aDispCurSuggestionItems[n]);
					}
				});
			} else {
				// add suggestion items to control
				oDispCur.removeAllSuggestionItems();
				for (var n = 0; n < oController.aDispCurSuggestionItems.length; n++) {
					oDispCur.addSuggestionItem(oController.aDispCurSuggestionItems[n]);
				}
			}

		},

		// ---------------------------------------------
		// CONTROLLING AREA LOGIC
		// ---------------------------------------------

		_toggleControllingAreaVisibility : function(oController) {

			var oControllingAreaConfig = oController.getView().byId("fin.gl.glview.display.smartfilterbar").getControlConfiguration()[0];
			var sAppVersion = this.getOwnerComponent().getMetadata().getManifest()["sap.app"].applicationVersion.version;

			// only hide for cloud (11.) versions, if not SNAPSHOT and not mock
			if(!jQuery.sap.getUriParameters().get("responderOn") && !jQuery.sap.getUriParameters().get("parametersProvided")){
				if((sAppVersion.indexOf("11.", 0) === 0) && (sAppVersion.indexOf("SNAPSHOT") === -1) && (oControllingAreaConfig.getKey() === "ControllingArea")){
					oControllingAreaConfig.setVisible(false);
				}	
			}

		},

		// ---------------------------------------------
		// FORMATTING
		// ---------------------------------------------

		_convToFilterDate : function(inDate) {
			// build format needed for oData request filter: "datetime'YYYY-MM-DDT00:00:00Z'"
			if(inDate !== null && inDate !== undefined){

				var date = new Date(inDate);

				var month = date.getMonth() + 1;
				if(month < 10){
					month = "0" + month;
				}

				var day = date.getDate();
				if(day < 10){
					day = "0" + day;
				}

				return date.getFullYear() + "-" + month + "-" + day + "T00:00:00Z";

			} else {
				return "";
			}
		},

		_formatIcon : function(sAccountingDocument, isOpenItemManaged, oClearingDate) {
			if (sAccountingDocument) {
				if (isOpenItemManaged === "X" || isOpenItemManaged === true) {
					if (oClearingDate !== null) {
						return IconPool.getIconURI("status-positive"); // 'Cleared' icon
					} else {
						return IconPool.getIconURI("status-error"); // 'Open' icon
					}
				} else {
					return IconPool.getIconURI("accept"); // 'Posted' icon
				}
			} else {
				return null;
			}
		},

		_formatIconTooltip : function(sAccountingDocument, isOpenItemManaged, oClearingDate) {
			if (sAccountingDocument) {
				if(isOpenItemManaged === "X" || isOpenItemManaged === true) {
					if(oClearingDate !== null){
						return this.textBundle.getText("IT_CLEARED");
					} else {
						return this.textBundle.getText("IT_OPEN");
					}
				} else {
					return this.textBundle.getText("IT_POSTED_NEW");
				}
			} else {
				return "";
			}
		},

		_formatIconColor : function(sAccountingDocument, isOpenItemManaged, oClearingDate) {
			if (sAccountingDocument) {
				if(isOpenItemManaged === "X" || isOpenItemManaged === true) {
					if(oClearingDate !== null) {
						return sap.ui.core.theming.Parameters.get("sapUiPositiveText"); // @sapUiPositiveText
					} else {
						return sap.ui.core.theming.Parameters.get("sapUiNegativeText"); // @sapUiNegativeText
					}
				} else {
					return sap.ui.core.theming.Parameters.get("sapUiPositiveText"); // @sapUiPositiveText
				}
			} else {
				return "";
			}
		},

		_formatDate : function(date) {
			if(date === null || date === undefined){
				return "";
			} else {
				var formatter = sap.ui.core.format.DateFormat.getDateInstance({style:"medium"});
				return formatter.format(new Date(date), true);
			}
		},

		_formatScale : function(currency) {
			if (this.oAvailableCurrencies && (this.oAvailableCurrencies[currency] !== undefined) && (this.oAvailableCurrencies[currency].digits > 3)) {
				return this.oAvailableCurrencies[currency].digits;
			} else {
				return 3;
			}
		},

		_formatNoI : function(number) {
			if(number === null || number === undefined){
				return "";
			} else {
				var formatter = sap.ui.core.format.NumberFormat.getInstance();
				return formatter.format(number);
			}
		},

		_formatAsset : function(mfa, fa) {
			if(mfa === null || mfa === undefined || mfa === ""){
				return "";
			} else {
				return mfa + " | " + fa;
			}
		},

		_formatOrderTargets : function(category) {
			if(category === "01"){
				return ["InternalOrder"];
			} else {
				return [];
			}
		},

		_formatIDTEXT : function(id, text) {
			if(id === null || id === undefined || id === ""){
				return "";
			} else if (text === null || text === undefined || text === "") {
				return id;
			} else {
				return id + " (" + text + ")";
			}
		},

		_formatToggleButtonText : function(bValue) {
			return bValue ? this.textBundle.getText("TITLE_HIDE_FILTERS") : this.textBundle.getText("TITLE_SHOW_FILTERS");
		},

		_formatErrorMessage : function(sMessage, sDescription, sURI) {
			var sDescriptionOut = "";
			if(sDescription){
				sDescriptionOut = sDescription;
			}
			return sMessage + this.textBundle.getText("ER_REQ_DETAIL") + sDescriptionOut + this.textBundle.getText("ER_REQ") + decodeURIComponent(sURI);
		},

		// usage of standard date format also for grouped date columns
		_setGroupHeaderFormatter: function() {
			var sPrefix = "fin.gl.glview.display.analyticaltable";
				if(this.byId(sPrefix + ".PostingDate") !== undefined) {
					this.byId(sPrefix + ".PostingDate").setGroupHeaderFormatter(this._formatDate);
				}
				if(this.byId(sPrefix + ".DocumentDate") !== undefined) {
					this.byId(sPrefix + ".DocumentDate").setGroupHeaderFormatter(this._formatDate);
				}
				if(this.byId(sPrefix + ".ClearingDate") !== undefined) {
					this.byId(sPrefix + ".ClearingDate").setGroupHeaderFormatter(this._formatDate);
				}
				if(this.byId(sPrefix + ".ExchangeRateDate") !== undefined) {
					this.byId(sPrefix + ".ExchangeRateDate").setGroupHeaderFormatter(this._formatDate);
				}
				if(this.byId(sPrefix + ".CreationDate") !== undefined) {
					this.byId(sPrefix + ".CreationDate").setGroupHeaderFormatter(this._formatDate);
				}
				if(this.byId(sPrefix + ".AssetValueDate") !== undefined) {
					this.byId(sPrefix + ".AssetValueDate").setGroupHeaderFormatter(this._formatDate);
				}
				if(this.byId(sPrefix + ".SettlementReferenceDate") !== undefined) {
					this.byId(sPrefix + ".SettlementReferenceDate").setGroupHeaderFormatter(this._formatDate);
				}
				if(this.byId(sPrefix + ".NetDueDate") !== undefined) {
					this.byId(sPrefix + ".NetDueDate").setGroupHeaderFormatter(this._formatDate);
				}
		},

		// ---------------------------------------------
		// EVENT HANDLING - CUSTOM FILTER
		// ---------------------------------------------

		_setDefaultOperationOfDateRangeType : function(oConditionType) {
			if(oConditionType.getFiscalYearVariant() !== ""){
				oConditionType.setOperation("FISCAL_YEAR_TO_DATE");
			} else {
				oConditionType.setOperation("YEARTODATE");
			}
			oConditionType.getModel().checkUpdate(true);
		},

		_initializeOperationOfDateRangeType : function(oConditionType) {
			oConditionType.setOperation("YEARTODATE"); // overwrite old entry, in case DATERANGE is already selected
			oConditionType.setOperation("DATERANGE");
			oConditionType.getModel().checkUpdate(true);
		},

		onChangeStatus : function(oEvent, bPreventDefaults) {

			var oSmartFilterBar = this.getView().byId("fin.gl.glview.display.smartfilterbar");
			var oPostingDateConditionType = oSmartFilterBar.getConditionTypeByKey("PostingDate");
			var oClearingDateConditionType = oSmartFilterBar.getConditionTypeByKey("ClearingDate");
//			var aFilterItems = oSmartFilterBar.getFilterGroupItems();
            var oFilterItem = oSmartFilterBar.determineFilterItemByName("PostingDate");
			var oStatusField = (oEvent && oEvent.getSource) ? oEvent.getSource() : this.getView().byId("fin.gl.glview.display.sfb.SSselect");

			// switch selected value
			switch(oStatusField.getSelectedKey()){
				case "DDLB_STATUS_ALL" :

					// store new selected status value
					this.oStatus = new fin.gl.glview.display.util.Status.StatusAll(this);

					// set visibility of depending controls I
					this.getView().byId("fin.gl.glview.display.sfb.XOPVW").setVisible(false);
					this.getView().byId("fin.gl.glview.display.sfb.KeyDate").setVisible(false);

					// set visibility of depending controls IIa
					if (oFilterItem) {
						oFilterItem.setVisible(true);
						oFilterItem.setVisibleInFilterBar(true);
					}

					if (!bPreventDefaults) {
						// set visibility of depending controls IIb
						oFilterItem = oSmartFilterBar.determineFilterItemByName("ClearingDate");
						if (oFilterItem) {
							oFilterItem.setVisible(true);
							oFilterItem.setVisibleInFilterBar(false);
						}
						// set default date
						this._setDefaultOperationOfDateRangeType(oPostingDateConditionType);
						this._initializeOperationOfDateRangeType(oClearingDateConditionType);
					}

					break;
				case "DDLB_STATUS_OPEN" :

					// store new selected status value
					this.oStatus = new fin.gl.glview.display.util.Status.StatusOpen(this);

					// set visibility of depending controls I
					this.getView().byId("fin.gl.glview.display.sfb.XOPVW").setVisible(false);
					this.getView().byId("fin.gl.glview.display.sfb.KeyDate").setVisible(true);

					if (!bPreventDefaults) {
						// set visibility of depending controls IIa
						if (oFilterItem) {
							oFilterItem.setVisible(true);
							oFilterItem.setVisibleInFilterBar(false);
						}
						oFilterItem = oSmartFilterBar.determineFilterItemByName("ClearingDate");
						if (oFilterItem) {
							oFilterItem.setVisible(true);
							oFilterItem.setVisibleInFilterBar(false);
						}
						// set default date
						this._initializeOperationOfDateRangeType(oPostingDateConditionType);
						this._initializeOperationOfDateRangeType(oClearingDateConditionType);
						this.getView().byId("fin.gl.glview.display.sfb.KDpicker").setDateValue(new Date());
					}

					// set visibility of depending controls IIb
					oFilterItem = oSmartFilterBar.determineFilterItemByName("KeyDate");
					if (oFilterItem) {
						oFilterItem.setVisibleInFilterBar(true);
					}

					break;
				case "DDLB_STATUS_CLEARED" :

					// store new selected status value
					this.oStatus = new fin.gl.glview.display.util.Status.StatusCleared(this);

					// set visibility of depending controls I
					this.getView().byId("fin.gl.glview.display.sfb.XOPVW").setVisible(false);
					this.getView().byId("fin.gl.glview.display.sfb.KeyDate").setVisible(true);

					if (!bPreventDefaults) {
						// set visibility of depending controls IIa
						if (oFilterItem) {
							oFilterItem.setVisible(true);
							oFilterItem.setVisibleInFilterBar(false);
						}
						// set default date
						this._initializeOperationOfDateRangeType(oPostingDateConditionType);
						this._setDefaultOperationOfDateRangeType(oClearingDateConditionType);
						this.getView().byId("fin.gl.glview.display.sfb.KDpicker").setValue("");
					}

					// set visibility of depending controls IIb
					oFilterItem = oSmartFilterBar.determineFilterItemByName("ClearingDate");
					if (oFilterItem) {
						oFilterItem.setVisible(true);
						oFilterItem.setVisibleInFilterBar(true);
					}
					oFilterItem = oSmartFilterBar.determineFilterItemByName("KeyDate");
					if (oFilterItem) {
						oFilterItem.setVisibleInFilterBar(true);
					}
			}

		},

		onKeyDateChanged : function(oEvent) {

			var oKeyDatePicker = this.getView().byId("fin.gl.glview.display.sfb.KDpicker");

			if(!oEvent.getParameter("valid")){
				if(oKeyDatePicker.getDateValue()){
					// wrong entry after valid entry
					// clear entry
					oKeyDatePicker.setDateValue(null);
				} else {
					// wrong entry after wrong entry
					// create dummy valid entry to clear entry afterwards
					oKeyDatePicker.setDateValue(new Date());
					oKeyDatePicker.setDateValue(null);
				}

			}

		},

		onToggleHeaderPressed : function(oEvent) {
			var oPageModel = this.getView().getModel("page");
			oPageModel.setProperty("/headerExpanded", (oPageModel.getProperty("/headerExpanded") === true) ? false : true);
		},

		onMessagePopoverPressed : function(oEvent) {

			// update the messaging model
			this._handleMessaging();

			// open message window and handle closing
			if(oEvent === this.getView().byId("fin.gl.glview.display.footer.button.alert")){
				window.setTimeout(function(){
					// opening is just possible, if the footer was already faded in
					this.oMessagePopover.openBy(oEvent);
				}.bind(this), 500);
			} else {
				// footer was already faded in and user clicked the button
				this.oMessagePopover.openBy(oEvent.getSource());
			}
			this.oMessagePopover.attachAfterClose(function(oClosingEvent){
				// clear messages for application
				this.oMessagePopover.getModel("messaging").getData().splice(0,this.oMessagePopover.getModel("messaging").getData().length);
				this.oCustomErrorMessages.splice(0,this.oCustomErrorMessages.length);
				this.getView().getModel("page").setProperty("/numberOfMessages", 0);
				this.bIsPossibleErrorTriggeredByUser = false; // set to true, after new search was triggered
			}.bind(this));

		},

		// ---------------------------------------------
		// SMART FILTER BAR AND TABLE FUNCTIONS & VARIANTS
		// ---------------------------------------------

		onAssignedFiltersChanged : function(oEvent) {
			var oSmartFilterBar = this.byId("fin.gl.glview.display.smartfilterbar");
			this.byId("fin.gl.glview.display.title.filter.text").setText(oSmartFilterBar.retrieveFiltersWithValuesAsText());

			if ((oSmartFilterBar.determineFilterItemByName("ExchangeRateType")) && (oSmartFilterBar.determineFilterItemByName("ExchangeRateType").getVisibleInAdvancedArea()) && 
			(this.aExRateSuggestionItems.length < 1) && (!this.bIsExRateRequestTriggered)) {
				// fill exchange rate suggestions
				this._fillExchangeRateSuggestions(this);
				this.bIsExRateRequestTriggered = true;
			}

			if ((oSmartFilterBar.determineFilterItemByName("DisplayCurrency")) && (oSmartFilterBar.determineFilterItemByName("DisplayCurrency").getVisibleInAdvancedArea()) && 
			(this.aDispCurSuggestionItems.length < 1) && (!this.bIsDispCurRequestTriggered)) {
				// fill display currency suggestions
				this._fillDisplayCurrencySuggestions(this);
				this.bIsDispCurRequestTriggered = true;
			}
		},

		// event not triggered, if dirty flag is not set for current variant!
		onFilterBarCancel : function(oEvent) {
			// nothing to do here
			// currently selected variant is loaded
		},

		onResetFilterBar : function(oEvent) {
			// nothing to do here
			// currently selected variant is loaded
		},

		onExecuteSearch : function(oEvent) {

			this.byId("fin.gl.glview.display.analyticaltable").setEnableBusyIndicator(true);
			this.bIsPossibleErrorTriggeredByUser = true; // error messages are activated again

			// store current application state, if a valid search will be triggered
			this.bIsSearchValid = true;
			if (this.oStatus.isValid()) {
				if (!jQuery.sap.getUriParameters().get("responderOn") && !jQuery.sap.getUriParameters().get("parametersProvided")) {
					// store inner application state, if application initialization was already done
					// e.g. if a standard/default variant was executed automatically, but a navigation scenario will overwrite this state,
					// do not create a new application state, before the navigation scenario was evaluated
					if (this.bIsMetadataLoaded && this.bIsControllerInitialized && this.bIsFilterBarInitialized && this.bIsLeadingLedgerFetchedAlready) {
						this.storeCurrentAppState();
						this.bIsPreviousSearchTriggeredBeforeNavWasEvaluated = false;
					} else {
						this.bIsPreviousSearchTriggeredBeforeNavWasEvaluated = true;
					}
				}
			} else {
				this.bIsSearchValid = false;
			}

		},

		// set the custom fields of the filter bar, which are used for the display currency and the table
		_setSfbDisplayCurrencyFields : function(oCustomFields, oSmartFilterBar) {
            var oExRateDatePicker = this.getView().byId("fin.gl.glview.display.sfb.ExRateDatePicker");
			oExRateDatePicker.setDateValue(new Date()); // -> use today as (hard!) default for variants
			this.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput").setValue(oCustomFields.exRateType);
			this.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput").setValue(oCustomFields.dispCur);
			this.getView().byId("fin.gl.glview.display.sfb.ExpandLevelInput").setSelectedKey(oCustomFields.expLevel);
			return;
		},

		// set the custom fields of the filter bar, which are related to the item status
		_setSfbItemStatusFields: function(oCustomFields, oSmartFilterBar) {

			// set XOPVW box
			this.getView().byId("fin.gl.glview.display.sfb.XOPVWselect").setSelectedKey(oCustomFields.XOPVWselect);

//			var aFilterItems = oSmartFilterBar.getFilterGroupItems();
            var oFilterItem = oSmartFilterBar.determineFilterItemByName("PostingDate");
			var sId = "fin.gl.glview.display.sfb.SSselect";

			// switch stored status value
			switch(oCustomFields.status){
				case "Open" :

					// set status
					this.getView().byId(sId).setSelectedKey("DDLB_STATUS_OPEN");
					this.oStatus = new fin.gl.glview.display.util.Status.StatusOpen(this);

					// set visibility of depending controls I
					this.getView().byId("fin.gl.glview.display.sfb.XOPVW").setVisible(false);
					this.getView().byId("fin.gl.glview.display.sfb.KeyDate").setVisible(true);

					// set visibility of depending controls II
	                if (oFilterItem && oCustomFields.fromDate) {
	                    oFilterItem.setVisible(true);
	                    oFilterItem.setVisibleInFilterBar(false);
	                    this._initializeOperationOfDateRangeType(oSmartFilterBar.getConditionTypeByKey("PostingDate"));
	                }
	                oFilterItem = oSmartFilterBar.determineFilterItemByName("ClearingDate");
	                if (oFilterItem && oCustomFields.toDate) {
	                    oFilterItem.setVisible(true);
	                    oFilterItem.setVisibleInFilterBar(false);
	                    this._initializeOperationOfDateRangeType(oSmartFilterBar.getConditionTypeByKey("ClearingDate"));
	                }
	                oFilterItem = oSmartFilterBar.determineFilterItemByName("KeyDate");
	                if (oFilterItem) {
	                    oFilterItem.setVisibleInFilterBar(true);
	                }

	                // variant with open at key date selected -> use today as (hard!) default
    				this.getView().byId("fin.gl.glview.display.sfb.KDpicker").setDateValue(new Date());

					break;
				case "Cleared" :

					// set status
					this.getView().byId(sId).setSelectedKey("DDLB_STATUS_CLEARED");
					this.oStatus = new fin.gl.glview.display.util.Status.StatusCleared(this);

					// set visibility of depending controls I
					this.getView().byId("fin.gl.glview.display.sfb.XOPVW").setVisible(false);
					this.getView().byId("fin.gl.glview.display.sfb.KeyDate").setVisible(true);

					// set visibility of depending controls II
	                if (oFilterItem && oCustomFields.fromDate) {
	                    oFilterItem.setVisible(true);
	                    oFilterItem.setVisibleInFilterBar(false);
	                    this._initializeOperationOfDateRangeType(oSmartFilterBar.getConditionTypeByKey("PostingDate"));
	                }
	                oFilterItem = oSmartFilterBar.determineFilterItemByName("ClearingDate");
	                if (oFilterItem && oCustomFields.toDate) {
	                    oFilterItem.setVisible(true);
	                    oFilterItem.setVisibleInFilterBar(true);
	                    this._setDefaultOperationOfDateRangeType(oSmartFilterBar.getConditionTypeByKey("ClearingDate"));
	                }
	                oFilterItem = oSmartFilterBar.determineFilterItemByName("KeyDate");
	                if (oFilterItem) {
	                    oFilterItem.setVisibleInFilterBar(true);
	                }

	                // set key date
	                var oKeyDate = this.getView().byId("fin.gl.glview.display.sfb.KDpicker");
					if(oCustomFields.keyDate){
						oKeyDate.setDateValue(new Date(oCustomFields.keyDate));
					}else{
						oKeyDate.setValue("");
					}

					break;
				case "All" :

					// set status
					this.getView().byId(sId).setSelectedKey("DDLB_STATUS_ALL");
					this.oStatus = new fin.gl.glview.display.util.Status.StatusAll(this);

					// set visibility of depending controls I
					this.getView().byId("fin.gl.glview.display.sfb.XOPVW").setVisible(false);
					this.getView().byId("fin.gl.glview.display.sfb.KeyDate").setVisible(false);

					// set visibility of depending controls II
	                if (oFilterItem && oCustomFields.fromDate) {
	                    oFilterItem.setVisible(true);
	                    oFilterItem.setVisibleInFilterBar(true);
	                    this._setDefaultOperationOfDateRangeType(oSmartFilterBar.getConditionTypeByKey("PostingDate"));
	                }
	                oFilterItem = oSmartFilterBar.determineFilterItemByName("ClearingDate");
	                if (oFilterItem && oCustomFields.toDate) {
	                    oFilterItem.setVisible(true);
	                    oFilterItem.setVisibleInFilterBar(false);
	                    this._initializeOperationOfDateRangeType(oSmartFilterBar.getConditionTypeByKey("ClearingDate"));
	                }
			}

		},

		_setSfbCustomFields : function(oCustomFields, oSmartFilterBar) {
			this._setSfbDisplayCurrencyFields(oCustomFields, oSmartFilterBar);
			this._setSfbItemStatusFields(oCustomFields, oSmartFilterBar);
		},

		onBeforeSFBVariantSave : function(oEvent) {

			var oSmartFilterBar = this.getView().byId("fin.gl.glview.display.smartfilterbar");

			var oCustomFields = "";
			var bFromDate = true;
			var bToDate = true;
			var sKeyDate = "";
			var sStatus = "";

			// check initialization case
			if(oEvent.getParameter("context") === "STANDARD"){
				// yes -> the standard variant is initialized
				var exRateDate = this.getView().byId("fin.gl.glview.display.sfb.ExRateDatePicker").getDateValue();
				var exRateType = this.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput").getValue();
				var dispCur = this.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput").getValue();
				var expLevel = this.getView().byId("fin.gl.glview.display.sfb.ExpandLevelInput").getSelectedKey();
				switch(this.getView().byId("fin.gl.glview.display.sfb.SSselect").getSelectedKey()){
					case "DDLB_STATUS_ALL" :
						sStatus = "All";
						// no key date

						break;
					case "DDLB_STATUS_OPEN" :
						sStatus = "Open";
						sKeyDate = this.getView().byId("fin.gl.glview.display.sfb.KDpicker").getDateValue();

						break;
					case "DDLB_STATUS_CLEARED" :
						sStatus = "Cleared";
						sKeyDate = this.getView().byId("fin.gl.glview.display.sfb.KDpicker").getDateValue();

				}

				oCustomFields = {
						status: sStatus,
						fromDate: bFromDate,
						toDate: bToDate,
						keyDate: sKeyDate,
						exRateDate: exRateDate,
						exRateType: exRateType,
						dispCur: dispCur,
						expLevel: expLevel
				};
			} else {
				oCustomFields = this.oStatus.getCustomFields();
				oCustomFields.expLevel = this.getView().byId("fin.gl.glview.display.sfb.ExpandLevelInput").getSelectedKey();
			}

			oCustomFields.XOPVWselect = this.getView().byId("fin.gl.glview.display.sfb.XOPVWselect").getSelectedKey();

			oSmartFilterBar.setFilterData({_CUSTOM : ""}); // clear CUSTOM object first
			oSmartFilterBar.setFilterData({_CUSTOM : oCustomFields});

		},

		onAfterSFBVariantSave : function(oEvent) {
			// store inner application state in case the user has executed a search,
			// saves the filter bar variant and then performs e.g. the action "Send Email"
			this.storeCurrentAppState();
		},

		onAfterSFBVariantLoad : function(oEvent) {

			var oSmartFilterBar = this.getView().byId("fin.gl.glview.display.smartfilterbar");
			var oCustomFields = {};

			// set leading ledger (if it is not part of the variant)
			if (!oSmartFilterBar.getFilterData().Ledger) {
				this._setDefaultLedgerInUI(this);
			}

			if (oSmartFilterBar.getFilterData() !== null && 
					oSmartFilterBar.getFilterData()._CUSTOM && 
					oSmartFilterBar.getFilterData()._CUSTOM !== {}) {
				// get custom content of the variant
				oCustomFields = oSmartFilterBar.getFilterData()._CUSTOM;
				this._setSfbCustomFields(oCustomFields, oSmartFilterBar);
			}

			// store inner application state, if application initialization was already done
			// e.g. if a default variant was loaded, but a navigation scenario will overwrite this state,
			// do not create a new application state, before the navigation scenario was evaluated
			if (this.bIsMetadataLoaded && this.bIsControllerInitialized && this.bIsFilterBarInitialized && this.bIsLeadingLedgerFetchedAlready) {
				if (this.bIsSFBTriggeredDueToInitialization === false) {
					this.storeCurrentAppState();
				} else {
					this.bIsSFBTriggeredDueToInitialization = false; // reset indicator
				}
			}

		},

		_handleAssetNavigation : function (oBindingParams) {

			var oFixedAsset = this.getView().byId("fin.gl.glview.display.analyticaltable.FixedAsset");
			var oMasterFixedAsset = this.getView().byId("fin.gl.glview.display.analyticaltable.MasterFixedAsset");
			var iPosSpecialFA = oBindingParams.parameters.select.indexOf(",FixedAsset");
			var iPosFA = oBindingParams.parameters.select.indexOf("FixedAsset");
			var iPosMFA = oBindingParams.parameters.select.indexOf("MasterFixedAsset");

			if((iPosMFA !== -1) && (iPosSpecialFA === -1)){
				// MasterFixedAsset requested only - add FixedAsset
				oFixedAsset.setInResult(true);
				oBindingParams.parameters.select = oBindingParams.parameters.select + ",FixedAsset";
			} else if ((iPosMFA === -1) && (iPosFA !== -1)){
				// FixedAsset requested only - add MasterFixedAsset
				oMasterFixedAsset.setInResult(true);
				oBindingParams.parameters.select = oBindingParams.parameters.select + ",MasterFixedAsset";
			} else if ((iPosMFA !== -1) && (iPosSpecialFA !== -1)){
				// nothing to do here - both fields are already requested
			} else {
				// asset is not requested - clear 'old' in result entries
				if(oFixedAsset.getInResult()){
					oFixedAsset.setInResult(false);
				}
				if(oMasterFixedAsset.getInResult()){
					oMasterFixedAsset.setInResult(false);
				}
			}

		},

		_handleOrderNavigation : function (oBindingParams) {

			var oOrderCategory = this.getView().byId("fin.gl.glview.display.analyticaltable.OrderCategory");
			var iPosID = oBindingParams.parameters.select.indexOf("OrderID");
			var iPosCAT = oBindingParams.parameters.select.indexOf("OrderCategory");

			if((iPosID !== -1) && (iPosCAT === -1)){
				// ID requested only - add Category
				oOrderCategory.setInResult(true);
				oBindingParams.parameters.select = oBindingParams.parameters.select + ",OrderCategory";
			} else if ((iPosID === -1) && (iPosCAT !== -1)){
				// Category requested only
				// nothing to do, as ID was not requested
			} else if ((iPosID !== -1) && (iPosCAT !== -1)){
				// nothing to do here - both fields are already requested
			} else {
				// order is not requested - clear 'old' in result entry
				if(oOrderCategory.getInResult()){
					oOrderCategory.setInResult(false);
				}
			}

		},

		onBeforeRebindTable : function (oEvent) {

			var oBindingParams = oEvent.getParameter("bindingParams");
			var oTable = oEvent.getSource();
			var oCustomFields = this.oStatus.getCustomFields();
			var bIsSearchStopped = false;
			var bIsDispCurSelected = false;

			this.getView().setBusy(false); // release busy - table will be busy while searching

			if(!this.bIsSearchValid){
				 oBindingParams.preventTableBind = true;
			} else {

				var sDisplayCurrency = "EUR"; // dummy
				var sExRateType = "M"; // dummy
				var sExRateDate = encodeURIComponent("2019-01-01T00:00:00"); // dummy

				if((oBindingParams.parameters.select.indexOf("AmountInDisplayCurrency") !== -1) ||
					(oBindingParams.parameters.select.indexOf("DisplayCurrency") !== -1) ||
					(oBindingParams.parameters.select.indexOf("ExchangeRateType") !== -1) ||
					(oBindingParams.parameters.select.indexOf("ExchangeRateDate") !== -1)){
					if(!oCustomFields.dispCur || !oCustomFields.exRateType || !oCustomFields.exRateDate){
						// Display Currency related attribute requested, but not all parameters provided -> no request, throw error
						oBindingParams.preventTableBind = true;
						this.oCustomErrorMessages.push({
							code:    this.textBundle.getText("ER_SEARCH"),
							type:    "Error",
							message: this.textBundle.getText("ERD1_PARAMS_DC")
						});
						// provide messages
						this.onMessagePopoverPressed(this.getView().byId("fin.gl.glview.display.footer.button.alert"));
						bIsSearchStopped = true;
					}
					bIsDispCurSelected = true;
				}

				if(!bIsSearchStopped){ // no error was thrown and request was not stopped

					if(bIsDispCurSelected){
						// Display Currency requested -> overwrite dummy values with maintained parameter values
						sDisplayCurrency = oCustomFields.dispCur;
						sExRateType = oCustomFields.exRateType;
						sExRateDate = encodeURIComponent(this._convToFilterDate(oCustomFields.exRateDate).substr(0,19));
					}

					// enable asset navigation targets
					this._handleAssetNavigation(oBindingParams);
					// enable order navigation targets
					this._handleOrderNavigation(oBindingParams);

					// set type and key date parameter
					var sKeyDate = encodeURIComponent(this._convToFilterDate(new Date()).substr(0,19)); // dummy
					var sType = "0"; // dummy

					switch(oCustomFields.status){
					case "All" :
						sType = "1"; // All Items
						break;
					case "Open" :
						sKeyDate = encodeURIComponent(this._convToFilterDate(oCustomFields.keyDate).substr(0,19));
						var aCustomFilters = this.oStatus.getFilters();
						if(aCustomFilters && aCustomFilters[0] && aCustomFilters[0].oValue1 === "X"){
							sType = "2"; // Open Items 4 OIM Accounts
						} else {
							sType = "3"; // Open Items 4 all Accounts
						}
						break;
					case "Cleared" :
						if(oCustomFields.keyDate){
							sKeyDate = encodeURIComponent(this._convToFilterDate(oCustomFields.keyDate).substr(0,19));
							sType = "4"; // Cleared Items w Key Date
						} else {
							sType = "5"; // Cleared Items w/o Key Date
						}

					}

					// disable row count - enabled if data was received
					oTable.setShowRowCount(false);

					// update table expand level, if necessary
					//var iLength = 0;
					//var aGroups = oTable.getUiState().getPresentationVariant().GroupBy;
					//if (aGroups) {
					//	iLength = aGroups.length;
					//}
					//var iLevels = parseInt(this.getView().byId("fin.gl.glview.display.sfb.ExpandLevelInput").getSelectedItem().getText());
					//if (iLevels > iLength) {
					//	iLevels = iLength;
					//}
/*					if (oTable.getTable().getBinding() && (iLevels !== oTable.getTable().getNumberOfExpandedLevels())) {
						oTable.getTable().setNumberOfExpandedLevels(iLevels); // update level
						oTable.getTable().unbindRows(); // remove old binding, so that new level is taken into account
					} else if (iLevels !== oTable.getTable().getNumberOfExpandedLevels()) {
						oTable.getTable().setNumberOfExpandedLevels(iLevels); // update level
					}*/ // -> use parameter instead, as recommended
					//oBindingParams.parameters.numberOfExpandedLevels = iLevels;

					if (!this.bIsInitialSearchTriggered) {
						// search gets triggered now for the first time
						this.bIsInitialSearchTriggered = true;
					}

					// change binding path from result entity set to parameter entity set and provide parameters
					oTable.setTableBindingPath("/C_JournalEntryItemBrowser(P_DisplayCurrency='" + sDisplayCurrency 
							+ "',P_ExchangeRateType='" + sExRateType + "',P_ExchangeRateDate=datetime'" + sExRateDate 
							+ "',P_KeyDate=datetime'" + sKeyDate + "',P_ClearingStatusSelection='" + sType + "')/Results");

					// check if grouping was removed
					//if (this.bIsCurrentSearchGrouped) {
					//	if (aGroups && aGroups.length > 0) {
					//		this.bIsCurrentSearchGrouped = true;
					//	} else {
					//		this.bIsCurrentSearchGrouped = false;
					//		// raise toast
					//		sap.m.MessageToast.show(this.textBundle.getText("INFO_GROUPING"), {duration: 6000, width: "100%"});
					//	}
					//} else { // check if grouping was applied again
					//	if (aGroups && aGroups.length > 0) {
					//		this.bIsCurrentSearchGrouped = true;
					//	}	
					//}

				} // else -> nothing to do anymore

			}

		},

		onBeforeExport : function(oEvent) {
			var mExcelSettings = oEvent.getParameter("exportSettings");

			if (mExcelSettings.workbook && mExcelSettings.workbook.columns) {
				mExcelSettings.workbook.columns.some(function(oColumnConfiguration) {
					if (oColumnConfiguration.property === "AmountInTransactionCrcy") {
						oColumnConfiguration.unitProperty = "TransactionCurrency";
						oColumnConfiguration.displayUnit = true;
						oColumnConfiguration.type = "currency";
					}
				});
			}
			mExcelSettings.dataSource.sizeLimit = 5000;   // number of fetched rows per request
		},

		onAfterTableVariantSave : function (oEvent) {
			// store inner application state
			this.storeCurrentAppState();
		},

		onAfterApplyTableVariant : function (oEvent) {
			// store inner application state, if application initialization was already done
			// e.g. if a default variant was loaded, but a navigation scenario will overwrite this state,
			// do not create a new application state, before the navigation scenario was evaluated
			if (this.bIsMetadataLoaded && this.bIsControllerInitialized && this.bIsFilterBarInitialized && this.bIsLeadingLedgerFetchedAlready) {
				if (this.bIsSTBTriggeredDueToInitialization === false) {
					this.storeCurrentAppState();
				} else {
					this.bIsSTBTriggeredDueToInitialization = false; // reset indicator
				}
			}
		},

		// ---------------------------------------------
		// SMART LINK EVENT HANDLERS
		// ---------------------------------------------

		onBeforePopoverOpens : function (oEvent) {

			// used for smart link of smart table
			var oSmartTableNavParams = oEvent.getParameters();
			var sSelectionVariant = this.getView().byId("fin.gl.glview.display.smartfilterbar").getDataSuiteFormat();
			sSelectionVariant = JSON.stringify(this._formatSelectionVariant(JSON.parse(sSelectionVariant)));
			var oSelectionVariant = new SelectionVariant(sSelectionVariant);
			var bIsClearingYearInitialCase = false;

			if(oSmartTableNavParams.semanticObject === "AccountingDocument" && oSmartTableNavParams.originalId.indexOf("Clearing") !== -1){

				// determine whether SL has been clicked for the inital year 0000
				if((oSmartTableNavParams.originalId.indexOf("ClearingDocFiscalYear") !== -1) && oSmartTableNavParams.semanticAttributes.ClearingDocFiscalYear && 
				(oSmartTableNavParams.semanticAttributes.ClearingDocFiscalYear === "0000")) {
					bIsClearingYearInitialCase = true;
				}

				// special case for clearing JE and fiscal year (partner fields are not enabled for table)
				// ignore all select options and parameters
				var iStartValue = oSelectionVariant.getSelectOptionsPropertyNames().length - 1;
				for(var i = iStartValue; i > -1; i--){
					oSelectionVariant.removeSelectOption(oSelectionVariant.getSelectOptionsPropertyNames()[i]);
				}
				iStartValue = oSelectionVariant.getParameterNames().length - 1;
				for(var n = iStartValue; n > -1; n--){
					oSelectionVariant.removeParameter(oSelectionVariant.getParameterNames()[n]);
				}

				// update selection variant
				sSelectionVariant = oSelectionVariant.toJSONString();

				// adjust semantic attributes for this special case
				var oSemanticAttributes = oSmartTableNavParams.semanticAttributes;
				var oNewSemanticAttributes = {};
				for(var key in oSemanticAttributes){
					if(key === "Ledger" || key === "CompanyCode" || key === "ChartOfAccounts" || key === "GLAccount" || key === "AccountingDocument"){
						oNewSemanticAttributes[key] = oSemanticAttributes[key];
					} else if (key === "ClearingDocFiscalYear") {
						oNewSemanticAttributes.FiscalYear = oSemanticAttributes.ClearingDocFiscalYear;
					}
				}
				if(oSemanticAttributes.ClearingAccountingDocument){
					// in case of clearing fiscal year smart link, the JE exchange has not happened automatically
					oNewSemanticAttributes.AccountingDocument = oSemanticAttributes.ClearingAccountingDocument;
				}

				// update parameters
				oEvent.getParameters().semanticAttributes = oNewSemanticAttributes;

			}

			if(!bIsClearingYearInitialCase) { // process and open SL popover
				this.oNavigationHandler.processBeforeSmartLinkPopoverOpens(oEvent.getParameters(), sSelectionVariant);
			} else { // show message instead
				MessageBox.show(this.textBundle.getText("SLIB_CONT"), {
						icon: MessageBox.Icon.INFORMATION,
						title: this.textBundle.getText("SLIB_HEADER")
				});
			}

		},

		_handleUseCaseInit : function (oPopupData, key, oSelectionVariantIn) {

			var oSelectionVariant = oSelectionVariantIn;

			// ignore select option, if there is more detailed pop up data
			var bIsAlreadySelOpt = false;
			for(var i = 0; i < oSelectionVariant.getSelectOptionsPropertyNames().length; i++){
				if(oSelectionVariant.getSelectOptionsPropertyNames()[i] === key){
					bIsAlreadySelOpt = true;
					break;
				}
			}
			if(bIsAlreadySelOpt){
				oSelectionVariant.removeSelectOption(key);
			}

			// add pop up data - ensure string value
			oSelectionVariant.addParameter(key, oPopupData[key].toString());
			return oSelectionVariant;

		},

		_handleUseCaseA : function (sLinkField, oPopupData, key, oSelectionVariantIn, bIsWorkDoneIn) {

			var oSelectionVariant = oSelectionVariantIn;
			var bIsWorkDone = bIsWorkDoneIn;

			switch(sLinkField){
			case "/AlternativeGLAccount" :
				if(key === "AlternativeGLAccount"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("GLAccount", oPopupData.AlternativeGLAccount.toString());
					bIsWorkDone = true;
				}
				break;
			case "/CountryChartOfAccounts" :
				if(key === "CountryChartOfAccounts"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("ChartOfAccounts", oPopupData.CountryChartOfAccounts.toString());
					bIsWorkDone = true;
				}
				break;
			case "/OffsettingAccount" :
				if(key === "OffsettingAccount"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("GLAccount", oPopupData.OffsettingAccount.toString());
					bIsWorkDone = true;
				}
				break;
			case "/PartnerCompanyCode" :
				if(key === "PartnerCompanyCode"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("CompanyCode", oPopupData.PartnerCompanyCode.toString());
					bIsWorkDone = true;
				}
				break;
			case "/PartnerProfitCenter" :
				if(key === "PartnerProfitCenter"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("ProfitCenter", oPopupData.PartnerProfitCenter.toString());
					bIsWorkDone = true;
				}
				break;
			case "/PartnerFunctionalArea" :
				if(key === "PartnerFunctionalArea"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("FunctionalArea", oPopupData.PartnerFunctionalArea.toString());
					bIsWorkDone = true;
				}
				break;
			case "/PartnerBusinessArea" :
				if(key === "PartnerBusinessArea"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("BusinessArea", oPopupData.PartnerBusinessArea.toString());
					bIsWorkDone = true;
				}
				break;
			case "/PartnerSegment" :
				if(key === "PartnerSegment"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("Segment", oPopupData.PartnerSegment.toString());
					bIsWorkDone = true;
				}
				break;
			case "/PartnerCostCenter" :
				if(key === "PartnerCostCenter"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("CostCenter", oPopupData.PartnerCostCenter.toString());
					bIsWorkDone = true;
				}
				break;
			case "/PartnerOrder" :
				if(key === "PartnerOrder"){
					// add pop up data - ensure string value
					oSelectionVariant.addParameter("OrderID", oPopupData.PartnerOrder.toString());
					bIsWorkDone = true;
				}
			}

			return {
				oSelectionVariant : oSelectionVariant,
				bIsWorkDone : bIsWorkDone
			};

		},

		_handleUseCaseB : function (oPopupData, key, oSelectionVariantIn) {

			var oSelectionVariant = oSelectionVariantIn;

			if(key === "ClearingAccountingDocument"){
				// add pop up data - ensure string value
				oSelectionVariant.addParameter("AccountingDocument", oPopupData.ClearingAccountingDocument.toString());
			} else if (key === "ClearingDocFiscalYear") {
				// add pop up data - ensure string value
				oSelectionVariant.addParameter("FiscalYear", oPopupData.ClearingDocFiscalYear.toString());
			} else if (key === "Ledger" || key === "CompanyCode" || key === "ChartOfAccounts" || key === "GLAccount") {
				// add pop up data - ensure string value
				oSelectionVariant.addParameter(key, oPopupData[key].toString());
			}

			return oSelectionVariant;

		},

		_handlePopUpData : function (oPopupData, sUseCase, oSelectionVariantIn, sLinkField) {

			var oSelectionVariant = oSelectionVariantIn;
			var bIsWorkDone = false;

			for(var key in oPopupData){
				// ignore the irrelevant pop up data
				if((key.indexOf("_metadata") === -1) && (key.indexOf("ID") === -1) && (key.indexOf("to_") === -1)
						&& (key.indexOf("Amount") === -1) && (key.indexOf("Quantity") === -1) && (key.indexOf("Currency") === -1)
						&& (key.indexOf("Parameters") === -1) && (key.indexOf("Crcy") === -1)
						&& (oPopupData[key] !== "") && (oPopupData[key] !== null) && (oPopupData[key] !== false) && (oPopupData[key] !== true)){

					// add relevant pop up data to selection variant
					switch(sUseCase){
					case "Init" : // 'normal' smart link - no partner field - take into account whole context
						oSelectionVariant = this._handleUseCaseInit(oPopupData, key, oSelectionVariant);
						break;
					case "A" : // smart link for partner field - just replace origin field with partner field - ignore other data
						var oResult = this._handleUseCaseA(sLinkField, oPopupData, key, oSelectionVariant, bIsWorkDone);
						oSelectionVariant = oResult.oSelectionVariant;
						bIsWorkDone = oResult.bIsWorkDone;
						break;
					case "B" : // smart link for clearing JE - replace origin JE with clearing JE - use Ledger, Company Code, Chart of Accounts, G/L Account
						       // and Clearing Document Fiscal Year as Fiscal Year - ignore other data
						oSelectionVariant = this._handleUseCaseB(oPopupData, key, oSelectionVariant);
					}

					if(bIsWorkDone){ // only executed for use case A
						break; // end loop over pop up data, because origin-partner exchange was already done
					}

				}
			}

			return oSelectionVariant;

		},

		_formatSelectionVariant : function (oOriginSelectionVariantIn) {

			var oOriginSelectionVariant = oOriginSelectionVariantIn;

			var iParameterLength = 0;
			if(oOriginSelectionVariant.Parameters){
				iParameterLength = oOriginSelectionVariant.Parameters.length;
			}
			var iSelOptLength = 0;
			if(oOriginSelectionVariant.SelectOptions){
				iSelOptLength = oOriginSelectionVariant.SelectOptions.length;
			}

			// format null values - only strings are accepted
			for(var j = 0; j < iParameterLength; j++){
				if(oOriginSelectionVariant.Parameters[j].PropertyValue === null){
					oOriginSelectionVariant.Parameters[j].PropertyValue = "";
				}
			}

			// format null values - only strings are accepted
			for(var m = 0; m < iSelOptLength; m++){
				if(oOriginSelectionVariant.SelectOptions[m].PropertyValue === null){
					oOriginSelectionVariant.SelectOptions[m].PropertyValue = "";
				}
			}

			return oOriginSelectionVariant;

		},

		onBeforePopoverOpens4RDP : function (oEvent) {

			// used for smart link of details pop up
			// get selection variant and pop up data
			var oPopupModel = this.oRowDetailsPopover.getModel("RowDetails");
			var oPopupData = oPopupModel.getData();
			var sSelectionVariant = this.getView().byId("fin.gl.glview.display.smartfilterbar").getDataSuiteFormat();
			sSelectionVariant = JSON.stringify(this._formatSelectionVariant(JSON.parse(sSelectionVariant)));
			var oSelectionVariant = new SelectionVariant(sSelectionVariant);
			var bIsClearingYearInitialCase = false;

			// determine use case
			var sLinkField = oEvent.getSource().getFieldName();
			var sUseCase = "Init";
			switch(sLinkField){
			case "/AlternativeGLAccount" :
				sUseCase = "A";
				break;
			case "/CountryChartOfAccounts" :
				sUseCase = "A";
				break;
			case "/OffsettingAccount" :
				sUseCase = "A";
				break;
			case "/PartnerCompanyCode" :
				sUseCase = "A";
				break;
			case "/PartnerProfitCenter" :
				sUseCase = "A";
				break;
			case "/PartnerFunctionalArea" :
				sUseCase = "A";
				break;
			case "/PartnerBusinessArea" :
				sUseCase = "A";
				break;
			case "/PartnerSegment" :
				sUseCase = "A";
				break;
			case "/PartnerCostCenter" :
				sUseCase = "A";
				break;
			case "/PartnerOrder" :
				sUseCase = "A";
				break;
			case "/ClearingAccountingDocument" :
				sUseCase = "B";
				break;
			case "/ClearingDocFiscalYear" :
				sUseCase = "B";
				// determine whether SL has been clicked for the inital year 0000
				if(oPopupData.ClearingDocFiscalYear && oPopupData.ClearingDocFiscalYear === "0000") {
					bIsClearingYearInitialCase = true;
				}
			}

			if(sUseCase === "A" || sUseCase === "B"){
				// ignore all select options and parameters
				var iStartValue = oSelectionVariant.getSelectOptionsPropertyNames().length - 1;
				for(var i = iStartValue; i > -1; i--){
					oSelectionVariant.removeSelectOption(oSelectionVariant.getSelectOptionsPropertyNames()[i]);
				}
				iStartValue = oSelectionVariant.getParameterNames().length - 1;
				for(var n = iStartValue; n > -1; n--){
					oSelectionVariant.removeParameter(oSelectionVariant.getParameterNames()[n]);
				}
			}

			var oParameters = oEvent.getParameters();
			if(sLinkField === "/AccountingDocCreatedByUser"){
				sSelectionVariant = oSelectionVariant.toJSONString();
				// provide origin context data to smart link, to enable navigation property to_UserContactCard
				this.oNavigationHandler.processBeforeSmartLinkPopoverOpens(oParameters, sSelectionVariant);
			} else {
				oParameters.semanticAttributes = null;
				oParameters.semanticAttributesOfSemanticObjects = null;
				sSelectionVariant = this._handlePopUpData(oPopupData, sUseCase, oSelectionVariant, sLinkField).toJSONString();
				if(!bIsClearingYearInitialCase) { // process and open SL popover
					// provide updated selection variant to smart link | ignore parameter data
					this.oNavigationHandler.processBeforeSmartLinkPopoverOpens(oParameters, sSelectionVariant);
				} else { // show message instead
					MessageBox.show(this.textBundle.getText("SLIB_CONT"), {
							icon: MessageBox.Icon.INFORMATION,
							title: this.textBundle.getText("SLIB_HEADER")
					});
				}
			}

		},

		onPopoverLinkPressed : function (oEvent) {
			// store application state
			this.storeCurrentAppState();
		},

		onPrefetchNavTargets : function (oEvent) {
			this.semanticObjects = oEvent.getParameter("semanticObjects");
		},

		onNavTargetsObtained : function (oEvent) {
			oEvent.getParameter("show")();
		},

		// ---------------------------------------------
		// ROW DETAILS OPTION
		// ---------------------------------------------

		onPressRowDetailsPopover : function (oEvent, bIsFiredByButton, oButtonPosition) {

			// create and link pop up
			if(!this.oRowDetailsPopover){
				this.oRowDetailsPopover = sap.ui.xmlfragment("Popover", "fin.gl.glview.display/view/RowDetailsPopover", this);
				this.getView().addDependent(this.oRowDetailsPopover);
			}

			// get context
			var oContext = "";
			if(bIsFiredByButton){
				// in that case oEvent contains the row context
				oContext = oEvent;
			} else {
				oContext = oEvent.getSource().getBindingContext();
			}

			var sLedger                 = this.getView().byId("fin.gl.glview.display.smartfilterbar").getFilterData().Ledger;
			var sSourceLedger           = oContext.getProperty("SourceLedger");
			var sCompanyCode            = oContext.getProperty("CompanyCode");
			var sGLAccount              = oContext.getProperty("GLAccount");
			var sAccountingDocument     = oContext.getProperty("AccountingDocument");
			var sAccountingDocumentItem = oContext.getProperty("AccountingDocumentItem");
			var sLedgerGLLineItem       = oContext.getProperty("LedgerGLLineItem");
			var sFiscalYear             = oContext.getProperty("FiscalYear");
			var sLedgerFiscalYear       = oContext.getProperty("LedgerFiscalYear");

			// build up filter key
			var sFilterString = "Ledger eq '" + sLedger                 + "'" +
			"and SourceLedger eq '"           + sSourceLedger           + "'" +
			"and CompanyCode eq '"            + sCompanyCode            + "'" +
			"and GLAccount eq '"              + sGLAccount              + "'" +
			"and AccountingDocument eq '"     + sAccountingDocument     + "'" +
			"and AccountingDocumentItem eq '" + sAccountingDocumentItem + "'" +
			"and LedgerGLLineItem eq '"       + sLedgerGLLineItem       + "'" +
			"and FiscalYear eq '"             + sFiscalYear             + "'" +
			"and LedgerFiscalYear eq '"       + sLedgerFiscalYear       + "'";

			var oTableModel = oContext.getModel();
			var oIconPosition = ""; // needed for pop up to determine, where it should appear
			if(bIsFiredByButton){
				// pop up position should be near the details button
				oIconPosition = oButtonPosition;
			} else {
				// pop up position should be near the status icon
				oIconPosition = oEvent.getSource();
			}

			// set busy and request data
			this.getView().setBusy(true);

			// build up path
			var sDisplayCurrency = "EUR"; // dummy
			if (oContext.getProperty("CompanyCodeCurrency")) {
				sDisplayCurrency = oContext.getProperty("CompanyCodeCurrency"); // exchange with more realisitc dummy
			}
			var sExRateType = "M"; // dummy
			var sExRateDate = encodeURIComponent(this._convToFilterDate(new Date()).substr(0,19)); // dummy
			var sKeyDate = encodeURIComponent(this._convToFilterDate(new Date()).substr(0,19)); // dummy
			var sType = "1"; // all items

			var oUrlParameters = {
				"$filter" : sFilterString
			};

			if (jQuery.sap.getUriParameters().get("responderOn") || jQuery.sap.getUriParameters().get("parametersProvided")) {
				sExRateDate = encodeURIComponent("2019-01-01T00:00:00"); // to match mock data result
				sKeyDate = encodeURIComponent("2017-12-06T00:00:00"); // to match mock data result
				sType = "2"; // to match mock data result
				oUrlParameters = {}; // to match mock data result
			}

			var sPath = "/C_JournalEntryItemBrowser(P_DisplayCurrency='" + sDisplayCurrency 
			+ "',P_ExchangeRateType='" + sExRateType + "',P_ExchangeRateDate=datetime'" + sExRateDate 
			+ "',P_KeyDate=datetime'" + sKeyDate + "',P_ClearingStatusSelection='" + sType + "')/Results";

			oTableModel.read(sPath, {
				urlParameters: oUrlParameters,
				success: function(oData, oResponse, aErrorResponses){

					// release busy and assign i18n model
					this.getView().setBusy(false);
					this.oRowDetailsPopover.setModel(this.getView().getModel("i18n"), "i18n");

					// build up JSON model for pop up
					var oRowDetailsPopoverModel = new JSONModel();
					oRowDetailsPopoverModel.setJSON(JSON.stringify(oData.results[0]));

					// assign JSON model and open pop up
					this.oRowDetailsPopover.setModel(oRowDetailsPopoverModel, "RowDetails");
					if(bIsFiredByButton){
						// open pop up on the left side of the details button
						this.oRowDetailsPopover.setPlacement("Left");
					} else {
						// open pop up on the right side of the status icon
						this.oRowDetailsPopover.setPlacement("Right");
					}
					this.oRowDetailsPopover.setBindingContext(oContext);
					this.oRowDetailsPopover.openBy(oIconPosition);

				}.bind(this),
				error: function(oError){
					this.getView().setBusy(false);
					// error message is handled centrally
				}.bind(this)
			});

		},

		onRowSelectionChange : function (oEvent){

			this._setDetailsButttonEnablement(oEvent.getSource(), oEvent);

		},

		_setDetailsButttonEnablement : function (oTable, oEvent){

			var oDetailsButton = this.getView().byId("fin.gl.glview.display.tb.Details");

			if(oTable.getSelectedIndices().length > 0){
				// one row selected - enable button and store/update row context
				oDetailsButton.setEnabled(true);
				//oDetailsButton.setTooltip(this.textBundle.getText("RDP_BUTTON_TOOL_B"));
				if(oEvent){
					this.oRowContext = oEvent.getParameter("rowContext");
				}
			} else {
				// no row selected - disable button and clear row context
				oDetailsButton.setEnabled(false);
				//oDetailsButton.setTooltip(this.textBundle.getText("RDP_BUTTON_TOOL_A"));
				this.oRowContext = "";
			}

		},

		onDetailsPressed : function (oEvent){
			if(this.oRowContext !== ""){
				// button pressed for selected row
				// 'simulate' status icon click and pass row context, button indicator and button position
				this.onPressRowDetailsPopover(this.oRowContext, true, this.getView().byId("fin.gl.glview.display.tb.Details"));
			}
		},

		// ---------------------------------------------
		// SHARE OPTIONS
		// ---------------------------------------------

		onTitleSharePressed : function(oEvent) {

			if(!this.oShareActionSheet){
				// create instance of share dialog
				this.oShareActionSheet = sap.ui.xmlfragment(this.getView().getId(), "fin.gl.glview.display.view.ShareActionSheet", this);
				this.getView().addDependent(this.oShareActionSheet);
			}

			// assign share model to dialog
			var oShareModel = new JSONModel();
			this.getView().setModel(oShareModel, "share");
			this.oShareActionSheet.setModel(oShareModel, "share");

			// get button texts
			oShareModel.setProperty("/emailButtonText", this.textBundle.getText("SHARE_EMAIL"));
			oShareModel.setProperty("/jamButtonText", this.textBundle.getText("SHARE_JAM"));
			oShareModel.setProperty("/bookmarkButtonText", this.textBundle.getText("SHARE_TILE"));

			// determine jam visibility and tile URL
			var fnGetUser = jQuery.sap.getObject("sap.ushell.Container.getUser");
			oShareModel.setProperty("/jamVisible", !!fnGetUser && fnGetUser().isJamActive());

			// open dialog
			this.oShareActionSheet.openBy(this.getView().byId("fin.gl.glview.display.title.button.share"));

			// attach event handler for AddBookmarkButton (save as tile)
			var oBookmarkButton = this.getView().byId("fin.gl.glview.display.share.tile");
			oBookmarkButton.setBeforePressHandler(function() {
				this.storeCurrentAppState().done(function() {
					if (!window.hasher) {
						sap.ui.require("sap/ui/thirdparty/hasher");
					}
					var sHash = window.hasher.getHash();
					var sCustomURI = sHash ? ("#" + sHash) : window.location.href;
					oBookmarkButton.setAppData({
						title:     this.textBundle.getText("BOOKMARK_TITLE_NEWII"),
						icon:      "sap-icon://Fiori5/F0706",
						customUrl: sCustomURI
					});
				}.bind(this));
			}.bind(this));

		},

		onShareEmailPress : function() {
			this.storeCurrentAppState().done(function() {
				sap.m.URLHelper.triggerEmail(
					null,
					this.textBundle.getText("FULLSCREEN_TITLE_NEWII"),
					document.URL
				);
			}.bind(this));
		},

		onShareInJamPress : function(oEvent) {
			this.storeCurrentAppState().done(function() {
				var sShareText = this.textBundle.getText("SHARE_TEXT_NEW"),
				sShareTitle = this.textBundle.getText("SHARE_TITLE_NEWII"),
				oShareDialog = sap.ui.getCore().createComponent({
					name: "sap.collaboration.components.fiori.sharing.dialog",
					settings: {
						object:{
							id:      document.URL,
							display: new sap.m.Label({text: sShareTitle}),
							share:   sShareText
						}
					}
				});
				oShareDialog.open();
			}.bind(this));
		},

		// ---------------------------------------------
		// APP STATE HANDLING
		// ---------------------------------------------

		storeCurrentAppState : function() {
			var oSmartFilterBar = this.getView().byId("fin.gl.glview.display.smartfilterbar");
			var oSmartTable = this.getView().byId("fin.gl.glview.display.smarttable");
			return this.oNavigationHandler.storeInnerAppState({
				selectionVariant: this._getCleanSuiteFormat(oSmartFilterBar),
				semanticDates:    JSON.stringify(oSmartFilterBar.getUiState().getSemanticDates()),
				tableVariantId:   oSmartTable.getCurrentVariantId(),
				customData: 	  this.getCustomAppStateData(oSmartFilterBar)
			});
		},

		_getCleanSuiteFormat : function(oSmartFilterBar) {

		//	var oDataSuiteFormat = JSON.parse(oSmartFilterBar.getDataSuiteFormat());
			var oDataSuiteFormat = oSmartFilterBar.getUiState().getSelectionVariant();
			var iCounterP = -1;
			var iCounterS = -1;
			if(oDataSuiteFormat.Parameters){
				iCounterP = oDataSuiteFormat.Parameters.length - 1;
			}
			if(oDataSuiteFormat.SelectOptions){
				iCounterS = oDataSuiteFormat.SelectOptions.length - 1;
			}

			// do not store the custom fields of the filter bar CUSTOM object within the selection variant
			// therefore customData is used within the application state
			// but these fields are provided by the suite format method, so they have to be removed
			// (this also applies for the display currency parameter of the the user default values - realized via customData)
			for(var i = iCounterP; i > -1; i--){
				var sPropertyP = oDataSuiteFormat.Parameters[i].PropertyName;
				if(sPropertyP === "fromDate" || sPropertyP === "toDate" || sPropertyP === "keyDate" || sPropertyP === "exRateDate" || sPropertyP === "expLevel" ||
						sPropertyP === "exRateType" || sPropertyP === "dispCur" || sPropertyP === "status" || sPropertyP === "XOPVWselect" || sPropertyP === "DisplayCurrency"){
					oDataSuiteFormat.Parameters.splice(i,1);
				}
			}
			for(var x = iCounterS; x > -1; x--){
				var sPropertyS = oDataSuiteFormat.SelectOptions[x].PropertyName;
				if(sPropertyS === "fromDate" || sPropertyS === "toDate" || sPropertyS === "keyDate" || sPropertyS === "exRateDate" || sPropertyS === "expLevel" ||
						sPropertyS === "exRateType" || sPropertyS === "dispCur" || sPropertyS === "status" || sPropertyS === "XOPVWselect" || sPropertyS === "DisplayCurrency"){
					oDataSuiteFormat.SelectOptions.splice(x,1);
				}
			}

			return JSON.stringify(oDataSuiteFormat);

		},

		getCustomAppStateData : function(oSmartFilterBar) {

			var oSmartTable = this.getView().byId("fin.gl.glview.display.smarttable");
			var oTableVariant = this.getView().byId("fin.gl.glview.display.smarttable-variant");
			var bIsTableVariantDirty = false;

			if (oTableVariant && oTableVariant.currentVariantGetModified()) { // check whether current table variant is dirty
				bIsTableVariantDirty = true;
			}

			var oCustomData = {
				ItemStatus:	this.oStatus.getCustomFields().status,
				SmartTableState: { // save table state, to able to apply in case of unsaved changes
					tableSelectionVariant: JSON.stringify(oSmartTable.getUiState().getSelectionVariant()),
					tablePresentationVariant: JSON.stringify(oSmartTable.getUiState().getPresentationVariant()),
					isTableVariantDirty: bIsTableVariantDirty
				}
			};

			if (this.isFieldInFilterItems(oSmartFilterBar, "KeyDate")) {
				oCustomData.KeyDate = this.getView().byId("fin.gl.glview.display.sfb.KDpicker").getValue();
			}
			if (this.isFieldInFilterItems(oSmartFilterBar, "DisplayCurrency")) {
				oCustomData.DisplayCurrency = this.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput").getValue();
			}
			if (this.isFieldInFilterItems(oSmartFilterBar, "ExchangeRateType")) {
				oCustomData.ExchangeRateType = this.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput").getValue();
			}
			if (this.isFieldInFilterItems(oSmartFilterBar, "ExchangeRateDate")) {
				oCustomData.ExchangeRateDate = this.getView().byId("fin.gl.glview.display.sfb.ExRateDatePicker").getValue();
			}
			if (this.isFieldInFilterItems(oSmartFilterBar, "LevelSelection")) {
				oCustomData.LevelSelection = this.getView().byId("fin.gl.glview.display.sfb.ExpandLevelInput").getSelectedKey();
				oCustomData.LevelVisibility = oSmartFilterBar.determineFilterItemByName("LevelSelection").getVisibleInAdvancedArea();
			}
			if (this.isFieldInFilterItems(oSmartFilterBar, "IsOpenItemManagedFlag")) {
				oCustomData.IsOpenItemManagedFlag = this.getView().byId("fin.gl.glview.display.sfb.XOPVWselect").getSelectedKey();
			}

			return oCustomData;
		},

		isFieldInFilterItems : function(oSmartFilterBar, sFieldName) {

			var aFilterItems = oSmartFilterBar.getAllFilterItems(true);
			for (var i = 0; i < aFilterItems.length; i++) {
				if (aFilterItems[i].getProperty("name") === sFieldName) {
					return true;
				}
			}

			return false;
		},

		restoreCustomAppStateData : function(oCustomData, oSmartFilterBar) {

			// display currency fields and table expand level
			if (oCustomData.DisplayCurrency || oCustomData.DisplayCurrency === "") {
				this.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput").setValue(oCustomData.DisplayCurrency);
				oSmartFilterBar.addFieldToAdvancedArea("DisplayCurrency"); // field is part of app state -> display it
			} else if (this.isFieldInFilterItems(oSmartFilterBar, "DisplayCurrency")) {
				this.getView().byId("fin.gl.glview.display.sfb.DisplayCurrencyInput").setValue(""); // default
				oSmartFilterBar.determineFilterItemByName("DisplayCurrency").setVisibleInFilterBar(false);
				oSmartFilterBar.determineFilterItemByName("DisplayCurrency").setPartOfCurrentVariant(false); // field is not part of app state, but already displayed (due to previous variant) -> de-select it
			}
			if (oCustomData.ExchangeRateType || oCustomData.ExchangeRateType === "") {
				this.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput").setValue(oCustomData.ExchangeRateType);
				oSmartFilterBar.addFieldToAdvancedArea("ExchangeRateType"); // field is part of app state -> display it
			} else if (this.isFieldInFilterItems(oSmartFilterBar, "ExchangeRateType")) {
				this.getView().byId("fin.gl.glview.display.sfb.ExRateTypeInput").setValue("M"); // default
				oSmartFilterBar.determineFilterItemByName("ExchangeRateType").setVisibleInFilterBar(false);
				oSmartFilterBar.determineFilterItemByName("ExchangeRateType").setPartOfCurrentVariant(false); // field is not part of app state, but already displayed (due to previous variant) -> de-select it
			}
			if (oCustomData.ExchangeRateDate || oCustomData.ExchangeRateDate === "") {
				this.getView().byId("fin.gl.glview.display.sfb.ExRateDatePicker").setValue(oCustomData.ExchangeRateDate);
				oSmartFilterBar.addFieldToAdvancedArea("ExchangeRateDate"); // field is part of app state -> display it
			} else if (this.isFieldInFilterItems(oSmartFilterBar, "ExchangeRateDate")) {
				this.getView().byId("fin.gl.glview.display.sfb.ExRateDatePicker").setDateValue(new Date()); // default
				oSmartFilterBar.determineFilterItemByName("ExchangeRateDate").setVisibleInFilterBar(false);	
				oSmartFilterBar.determineFilterItemByName("ExchangeRateDate").setPartOfCurrentVariant(false); // field is not part of app state, but already displayed (due to previous variant) -> de-select it
			}
			if (oCustomData.LevelSelection) {
				this.getView().byId("fin.gl.glview.display.sfb.ExpandLevelInput").setSelectedKey(oCustomData.LevelSelection);
				if (oCustomData.LevelVisibility) {
					oSmartFilterBar.addFieldToAdvancedArea("LevelSelection"); // field is part of app state -> display it
				}
			} else if (this.isFieldInFilterItems(oSmartFilterBar, "LevelSelection")) {
				this.getView().byId("fin.gl.glview.display.sfb.ExpandLevelInput").setSelectedKey("L0"); // default
				oSmartFilterBar.determineFilterItemByName("LevelSelection").setVisibleInFilterBar(false);	
				oSmartFilterBar.determineFilterItemByName("LevelSelection").setPartOfCurrentVariant(false); // field is not part of app state, but already displayed (due to previous variant) -> de-select it
			}

			// item status fields
			if (oCustomData.IsOpenItemManagedFlag) {
				this.getView().byId("fin.gl.glview.display.sfb.XOPVWselect").setSelectedKey(oCustomData.IsOpenItemManagedFlag);
				// oSmartFilterBar.addFieldToAdvancedArea("IsOpenItemManagedFlag");
				// field is not longer available for the user
				// just in case custom navigation parameter SelectOnlyOIMAccounts contained "false",
				// IsOpenItemManagedFlag contains "DDLB_INCLUDE", which is evaluated during search
			}

			// field for item status
			var sStatusKey = "DDLB_STATUS_OPEN";     // case "Open"
			switch (oCustomData.ItemStatus) {
			case "Cleared":
				sStatusKey = "DDLB_STATUS_CLEARED";  // case "Cleared"
				break;
			case "All":
				sStatusKey = "DDLB_STATUS_ALL";      // case "All"
				break;
			}

			// set item status
			this.getView().byId("fin.gl.glview.display.sfb.SSselect").setSelectedKey(sStatusKey);

			// trigger status change event handler manually -> event === null
			// "true" prevents the default date handling of the event handler
			// clearing date and posting date values are part of the selection variant
			// key date is handled below
			this.onChangeStatus(null, true);

			// key date handling
			// set key date if stored, otherwise initialize with ""
			if (oCustomData.KeyDate || oCustomData.KeyDate === "") {
				this.getView().byId("fin.gl.glview.display.sfb.KDpicker").setValue(oCustomData.KeyDate);
			}

			return;
		},

		_getFilterDataFromNavKeyFormat : function(oNavParams) { // special filter logic for private navigation key scenario

			// adjust filter for Ledger
			if(!oNavParams.oFilterBarFilterData.Ledger || oNavParams.oFilterBarFilterData.Ledger === ""){
				oNavParams.oFilterBarFilterData.Ledger = ""; // triggers error message of search
			}
			if(!oNavParams.oFilterBarFilterData.Ledger.value){
				var tmp = oNavParams.oFilterBarFilterData.Ledger;
				oNavParams.oFilterBarFilterData.Ledger = {};
				oNavParams.oFilterBarFilterData.Ledger.value = tmp;
			}

			// adjust filter for D/C Indicator: sender application might send filter value in field 'value', however, proper display in
			// filter bar seems to require the value to be part of array 'items' (DDLB)
			if(oNavParams.oFilterBarFilterData.DebitCreditCode && oNavParams.oFilterBarFilterData.DebitCreditCode.value !== ""){
				oNavParams.oFilterBarFilterData.DebitCreditCode.items.push({key : oNavParams.oFilterBarFilterData.DebitCreditCode.value });
				oNavParams.oFilterBarFilterData.DebitCreditCode.value = "";
			}

			// adjust filter for FunctionalArea
			if(oNavParams.oFilterBarFilterData.FunctionalArea && (oNavParams.oFilterBarFilterData.FunctionalArea.value || oNavParams.oFilterBarFilterData.FunctionalArea.value === " ")){
				// get value
				var funcArea = oNavParams.oFilterBarFilterData.FunctionalArea.value;
				// build up filter format
				var newFuncArea = {
						exclude: false,
						keyField: "FunctionalArea",
						operation: "EQ",
						value1: funcArea,
						value2: null
				};
				// build up FunctionalArea
				var items = [];
				var ranges = [];
				ranges.push(newFuncArea);
				var funcAreaWrapper = {
						items: items,
						ranges: ranges
				};
				// reset FunctionalArea
				oNavParams.oFilterBarFilterData.FunctionalArea = funcAreaWrapper;
			}

			// adjust filter for FiscalPeriod (formerly LedgerFiscalPeriod)
			var low = "";
			var high = "";
			if(oNavParams.oFilterBarFilterData.LedgerFiscalPeriod && oNavParams.oFilterBarFilterData.LedgerFiscalPeriod.low){
				// get low and high
				if(oNavParams.oFilterBarFilterData.LedgerFiscalPeriod.low.length === 7){ // sender format "xxx-yyy"
					low = oNavParams.oFilterBarFilterData.LedgerFiscalPeriod.low.substring(0, 3);
					high = oNavParams.oFilterBarFilterData.LedgerFiscalPeriod.low.substring(4);
				} else {
					low = oNavParams.oFilterBarFilterData.LedgerFiscalPeriod.low.substring(0, 3);
					if(oNavParams.oFilterBarFilterData.LedgerFiscalPeriod.high){
						high = oNavParams.oFilterBarFilterData.LedgerFiscalPeriod.high.substring(0, 3);
					} else {
						high = low;
					}
				}
				// build up filter format
				var period = {
						exclude: false,
						keyField: "FiscalPeriod",
						operation: "BT",
						value1: low,
						value2: high
				};
				// build up FiscalPeriod (formerly LedgerFiscalPeriod)
				var periodWrapper = {
						items: [],
						ranges: [period]
				};
				// add filter for field FiscalPeriod (formerly LedgerFiscalPeriod)
				oNavParams.oFilterBarFilterData.FiscalPeriod = periodWrapper;
			}

			// adjust filter for LedgerFiscalYear
			if(oNavParams.oFilterBarFilterData.LedgerFiscalYear){
				// get value
				var sLedgerFiscalYear = oNavParams.oFilterBarFilterData.LedgerFiscalYear;
				if(sLedgerFiscalYear.value){
					sLedgerFiscalYear = sLedgerFiscalYear.value;
				}
				// build up filter format
				var oFilter = {
						exclude: false,
						keyField: "LedgerFiscalYear",
						operation: "EQ",
						value1: sLedgerFiscalYear.toString(),
						value2: null
				};
				// build up LedgerFiscalYear
				var oInputFieldContent = {
						items:  [],
						ranges: [oFilter]
				};
				// reset LedgerFiscalYear
				oNavParams.oFilterBarFilterData.LedgerFiscalYear = oInputFieldContent;
			}

			return oNavParams.oFilterBarFilterData;
		}

	});
});