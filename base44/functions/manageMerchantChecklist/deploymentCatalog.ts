// Sync with src/lib/deploymentChecklistCatalog.raw.json
// Generated - do not hand-edit catalog data; regenerate from the raw JSON.

export type DeploymentStatus = 'scheduled' | 'in_progress' | 'hold' | 'completed';

export type DeploymentCatalogItem = {
  phase: string;
  phaseNum: number | string;
  key: string;
  title: string;
  description: string;
  audience: string;
  autoRule: string | null;
  requiresUpload: boolean;
};

export type DeploymentPhase = {
  id: string;
  num: number | string;
  label: string;
};

export const DEPLOYMENT_CATALOG = [
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_signed_agreement_sow",
    "title": "Confirm signed agreement/SOW",
    "description": "Ensure the Statement of Work is signed by all parties.",
    "audience": "ops",
    "autoRule": "quote_paid",
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_store_contact_information",
    "title": "Confirm store contact information",
    "description": "Verify the primary contact details for the store.",
    "audience": "merchant",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_installation_date_and_time",
    "title": "Confirm installation date and time",
    "description": "Finalize the schedule for the POS deployment.",
    "audience": "installer",
    "autoRule": "install_date_set",
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_verify_business_hours",
    "title": "Verify business hours",
    "description": "Check the store's operating hours for configuration.",
    "audience": "merchant",
    "autoRule": "hours_present",
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_obtain_floor_plan_if_available",
    "title": "Obtain floor plan (if available)",
    "description": "Get the store layout to plan hardware placement.",
    "audience": "merchant",
    "autoRule": null,
    "requiresUpload": true
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_internet_provider",
    "title": "Confirm internet provider",
    "description": "Identify the ISP and ensure active connection.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_payment_processor_account_is_active",
    "title": "Confirm payment processor account is active",
    "description": "Verify the merchant account is ready for transactions.",
    "audience": "ops",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_verify_merchant_id_mid",
    "title": "Verify merchant ID (MID)",
    "description": "Check the MID matches the payment processor details.",
    "audience": "ops",
    "autoRule": "mid_live",
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_tax_rates",
    "title": "Confirm tax rates",
    "description": "Ensure local and state tax rates are documented.",
    "audience": "merchant",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_menu_product_database",
    "title": "Confirm menu/product database",
    "description": "Verify the product list is ready for import.",
    "audience": "merchant",
    "autoRule": "menu_uploaded",
    "requiresUpload": true
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_employee_list",
    "title": "Confirm employee list",
    "description": "Ensure the list of staff and roles is available.",
    "audience": "merchant",
    "autoRule": null,
    "requiresUpload": true
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_printer_locations",
    "title": "Confirm printer locations",
    "description": "Identify where receipt and kitchen printers will be placed.",
    "audience": "merchant",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_confirm_kitchen_workflow",
    "title": "Confirm kitchen workflow",
    "description": "Understand how orders route to the kitchen.",
    "audience": "merchant",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pre_installation",
    "phaseNum": 1,
    "key": "pre_installation_backup_existing_pos_data_if_replacing_another_system",
    "title": "Backup existing POS data (if replacing another system)",
    "description": "Securely back up data from the legacy system.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": true
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_pos_terminal_s",
    "title": "POS Terminal(s)",
    "description": "Unbox and inspect the main POS terminals.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_power_adapter",
    "title": "Power adapter",
    "description": "Ensure all power adapters are present and working.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_receipt_printer",
    "title": "Receipt printer",
    "description": "Check the receipt printers for readiness.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_cash_drawer",
    "title": "Cash drawer",
    "description": "Verify cash drawers open and connect properly.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_barcode_scanner",
    "title": "Barcode scanner",
    "description": "Test barcode scanners for functionality.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_customer_display",
    "title": "Customer display",
    "description": "Ensure customer-facing displays are operational.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_credit_card_terminal",
    "title": "Credit card terminal",
    "description": "Inspect the credit card payment terminals.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_pin_pad",
    "title": "PIN pad",
    "description": "Verify PIN pads are ready for setup.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_kitchen_printer",
    "title": "Kitchen printer",
    "description": "Inspect printers designated for kitchen orders.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_label_printer",
    "title": "Label printer",
    "description": "Check label printers for order tagging.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_scale",
    "title": "Scale",
    "description": "Ensure scales are calibrated and ready.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_backup_battery_ups",
    "title": "Backup battery (UPS)",
    "description": "Verify UPS units are fully charged.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_router",
    "title": "Router",
    "description": "Inspect the primary network router.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_switch",
    "title": "Switch",
    "description": "Check network switches for adequate ports.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_firewall",
    "title": "Firewall",
    "description": "Ensure firewall hardware is present.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_wi_fi_access_point",
    "title": "Wi-Fi Access Point",
    "description": "Verify APs for wireless connectivity.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_backup_internet",
    "title": "Backup Internet",
    "description": "Check secondary internet hardware.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_ethernet_cables",
    "title": "Ethernet cables",
    "description": "Ensure sufficient cabling is available.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "hardware",
    "phaseNum": 2,
    "key": "hardware_cable_labels",
    "title": "Cable labels",
    "description": "Verify labels are ready for cable management.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_install_router",
    "title": "Install router",
    "description": "Physically install and power on the router.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_configure_wan",
    "title": "Configure WAN",
    "description": "Set up the Wide Area Network settings.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_configure_lan",
    "title": "Configure LAN",
    "description": "Set up the Local Area Network settings.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_configure_wi_fi",
    "title": "Configure Wi-Fi",
    "description": "Set up the primary wireless network.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_configure_guest_wi_fi",
    "title": "Configure Guest Wi-Fi",
    "description": "Set up an isolated guest network.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_configure_pos_vlan_if_required",
    "title": "Configure POS VLAN (if required)",
    "description": "Isolate POS traffic on a dedicated VLAN.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_assign_static_ips",
    "title": "Assign Static IPs",
    "description": "Assign fixed IP addresses to critical hardware.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_configure_dhcp_reservations",
    "title": "Configure DHCP reservations",
    "description": "Set up DHCP rules for dynamic devices.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_test_internet_speed",
    "title": "Test Internet speed",
    "description": "Run a speed test to ensure adequate bandwidth.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_test_failover_internet",
    "title": "Test failover internet",
    "description": "Verify the backup connection activates on failure.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_enable_remote_management",
    "title": "Enable remote management",
    "description": "Set up remote access for support purposes.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "network",
    "phaseNum": 3,
    "key": "network_document_network_credentials",
    "title": "Document network credentials",
    "description": "Record all network passwords securely.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_install_pos_application",
    "title": "Install POS application",
    "description": "Download and install the POS software.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_install_latest_updates",
    "title": "Install latest updates",
    "description": "Apply all available software patches.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_activate_license",
    "title": "Activate license",
    "description": "Enter the license key to activate the software.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_location",
    "title": "Configure location",
    "description": "Set the store's physical address in the system.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_store_number",
    "title": "Configure store number",
    "description": "Assign the unique store identifier.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_business_hours",
    "title": "Configure business hours",
    "description": "Input the operating hours into the POS.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_taxes",
    "title": "Configure taxes",
    "description": "Set up applicable tax rates in the system.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_service_charges",
    "title": "Configure service charges",
    "description": "Add any standard service fees or auto-gratuities.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_discounts",
    "title": "Configure discounts",
    "description": "Set up standard promotional discounts.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_tips",
    "title": "Configure tips",
    "description": "Enable and configure tipping options.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_payment_methods",
    "title": "Configure payment methods",
    "description": "Enable accepted tender types.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_receipts",
    "title": "Configure receipts",
    "description": "Customize the receipt header, footer, and logo.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_kitchen_routing",
    "title": "Configure kitchen routing",
    "description": "Set rules for routing items to specific prep stations.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "pos_software",
    "phaseNum": 4,
    "key": "pos_software_configure_printer_mapping",
    "title": "Configure printer mapping",
    "description": "Assign specific printers to specific POS stations.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_activate_payment_gateway",
    "title": "Activate payment gateway",
    "description": "Connect the POS to the payment processor.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_pair_payment_terminal",
    "title": "Pair payment terminal",
    "description": "Link the card reader to the POS terminal.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_download_terminal_parameters",
    "title": "Download terminal parameters",
    "description": "Update the card reader with merchant settings.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_test_sale",
    "title": "Test sale",
    "description": "Process a test transaction.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_test_refund",
    "title": "Test refund",
    "description": "Process a test refund.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_test_void",
    "title": "Test void",
    "description": "Process a test void transaction.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_test_tip_adjustment",
    "title": "Test tip adjustment",
    "description": "Adjust a tip on a test transaction.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_test_settlement",
    "title": "Test settlement",
    "description": "Run a test batch settlement.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_verify_merchant_information",
    "title": "Verify merchant information",
    "description": "Check that the correct merchant name appears on receipts.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "payment",
    "phaseNum": 5,
    "key": "payment_verify_signature_capture",
    "title": "Verify signature capture",
    "description": "Test digital signature functionality on the terminal.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_import_products",
    "title": "Import products",
    "description": "Load the menu or product database into the POS.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_verify_categories",
    "title": "Verify categories",
    "description": "Ensure items are grouped correctly.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_verify_modifiers",
    "title": "Verify modifiers",
    "description": "Check that item customizations are accurate.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_verify_combo_meals",
    "title": "Verify combo meals",
    "description": "Test combo or bundled item setups.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_verify_pricing",
    "title": "Verify pricing",
    "description": "Spot-check prices against the master list.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_verify_taxes",
    "title": "Verify taxes",
    "description": "Ensure items have the correct tax rules applied.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_verify_inventory",
    "title": "Verify inventory",
    "description": "Check initial stock levels if applicable.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_verify_upcs",
    "title": "Verify UPCs",
    "description": "Ensure barcodes match the product database.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_verify_product_images",
    "title": "Verify product images",
    "description": "Check that item photos display correctly.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "product",
    "phaseNum": 6,
    "key": "product_verify_online_menu",
    "title": "Verify online menu",
    "description": "Ensure the digital menu syncs properly.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "employee",
    "phaseNum": 7,
    "key": "employee_create_employee_accounts",
    "title": "Create employee accounts",
    "description": "Set up user profiles for all staff.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "employee",
    "phaseNum": 7,
    "key": "employee_assign_permissions",
    "title": "Assign permissions",
    "description": "Grant access levels based on employee roles.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "employee",
    "phaseNum": 7,
    "key": "employee_configure_manager_approval",
    "title": "Configure manager approval",
    "description": "Set which actions require a manager override.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "employee",
    "phaseNum": 7,
    "key": "employee_configure_employee_pins",
    "title": "Configure employee PINs",
    "description": "Assign unique login codes to staff.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "employee",
    "phaseNum": 7,
    "key": "employee_configure_time_clock",
    "title": "Configure time clock",
    "description": "Set up the time and attendance tracking.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "employee",
    "phaseNum": 7,
    "key": "employee_configure_employee_roles",
    "title": "Configure employee roles",
    "description": "Define job titles and responsibilities.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "employee",
    "phaseNum": 7,
    "key": "employee_configure_labor_reports",
    "title": "Configure labor reports",
    "description": "Set up reports for tracking hours and wages.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_receipt_printer",
    "title": "Receipt printer",
    "description": "Test printing a standard receipt.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_kitchen_printer",
    "title": "Kitchen printer",
    "description": "Test printing an order ticket to the kitchen.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_kitchen_display_system_kds",
    "title": "Kitchen display system (KDS)",
    "description": "Verify orders appear correctly on the KDS screen.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_cash_drawer",
    "title": "Cash drawer",
    "description": "Ensure the drawer kicks open during a cash sale.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_barcode_scanner",
    "title": "Barcode scanner",
    "description": "Scan an item to verify it rings up correctly.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_customer_display",
    "title": "Customer display",
    "description": "Check that the customer-facing screen shows the order.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_label_printer",
    "title": "Label printer",
    "description": "Test printing a customized label.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_scale",
    "title": "Scale",
    "description": "Verify weight readings sync with the POS.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_payment_terminal",
    "title": "Payment terminal",
    "description": "Ensure the terminal prompts for payment correctly.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_caller_id_if_applicable",
    "title": "Caller ID (if applicable)",
    "description": "Test incoming calls for customer recognition.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_online_ordering_tablet",
    "title": "Online ordering tablet",
    "description": "Verify the tablet receives online orders.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "peripheral",
    "phaseNum": 8,
    "key": "peripheral_drive_thru_equipment_if_applicable",
    "title": "Drive-thru equipment (if applicable)",
    "description": "Test headsets and drive-thru displays.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_dine_in_order",
    "title": "Dine-in order",
    "description": "Process a standard dine-in transaction.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_takeout_order",
    "title": "Takeout order",
    "description": "Process a standard takeout transaction.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_delivery_order",
    "title": "Delivery order",
    "description": "Process a standard delivery transaction.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_online_order",
    "title": "Online order",
    "description": "Process an order placed via the online portal.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_gift_card_sale",
    "title": "Gift card sale",
    "description": "Process the sale and activation of a gift card.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_gift_card_redemption",
    "title": "Gift card redemption",
    "description": "Pay for an order using a gift card.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_loyalty_enrollment",
    "title": "Loyalty enrollment",
    "description": "Sign up a test customer for the loyalty program.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_coupon_redemption",
    "title": "Coupon redemption",
    "description": "Apply a discount code or coupon to an order.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_split_payment",
    "title": "Split payment",
    "description": "Pay for an order using two different tender types.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_split_checks",
    "title": "Split checks",
    "description": "Divide a single order into multiple separate checks.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_cash_payment",
    "title": "Cash payment",
    "description": "Complete a transaction using cash.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_credit_card_payment",
    "title": "Credit card payment",
    "description": "Complete a transaction using a credit card.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_debit_card_payment",
    "title": "Debit card payment",
    "description": "Complete a transaction using a debit card.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_contactless_payment",
    "title": "Contactless payment",
    "description": "Complete a transaction using tap-to-pay.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_apple_pay_google_pay",
    "title": "Apple Pay / Google Pay",
    "description": "Complete a transaction using a mobile wallet.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_refund_transaction",
    "title": "Refund transaction",
    "description": "Successfully process a full refund.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_void_transaction",
    "title": "Void transaction",
    "description": "Successfully void an order before payment.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_manager_override",
    "title": "Manager override",
    "description": "Trigger and approve a manager-restricted action.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "functional",
    "phaseNum": 9,
    "key": "functional_receipt_reprint",
    "title": "Receipt reprint",
    "description": "Reprint a receipt from a past transaction.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_sales_report",
    "title": "Sales report",
    "description": "Generate and review the daily sales summary.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_hourly_sales_report",
    "title": "Hourly sales report",
    "description": "Check sales broken down by hour.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_product_mix_report",
    "title": "Product mix report",
    "description": "Review sales data by individual item.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_category_sales_report",
    "title": "Category sales report",
    "description": "Review sales data by product category.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_labor_report",
    "title": "Labor report",
    "description": "Generate a report of employee hours worked.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_tax_report",
    "title": "Tax report",
    "description": "Verify collected taxes are calculated correctly.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_tip_report",
    "title": "Tip report",
    "description": "Review tips collected by employees.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_inventory_report",
    "title": "Inventory report",
    "description": "Check stock levels and depletion.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_payment_summary_report",
    "title": "Payment summary report",
    "description": "Review totals by payment method.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_end_of_day_eod_report",
    "title": "End-of-day (EOD) report",
    "description": "Run the standard closing report.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "reporting",
    "phaseNum": 10,
    "key": "reporting_settlement_report",
    "title": "Settlement report",
    "description": "Verify the credit card batch settlement.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_online_ordering_integration",
    "title": "Online ordering integration",
    "description": "Test the connection to the online ordering platform.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_delivery_platform_integration",
    "title": "Delivery platform integration",
    "description": "Test the connection to third-party delivery apps.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_loyalty_program_integration",
    "title": "Loyalty program integration",
    "description": "Verify points accrue in the loyalty system.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_gift_card_integration",
    "title": "Gift card integration",
    "description": "Ensure third-party gift cards process correctly.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_accounting_integration",
    "title": "Accounting integration",
    "description": "Test data sync with accounting software.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_inventory_integration",
    "title": "Inventory integration",
    "description": "Verify sync with external inventory management.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_employee_scheduling_integration",
    "title": "Employee scheduling integration",
    "description": "Test connection to scheduling software.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_kitchen_display_system_kds_integration",
    "title": "Kitchen Display System (KDS) integration",
    "description": "Ensure POS communicates with third-party KDS.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_ai_phone_system_integration",
    "title": "AI phone system integration",
    "description": "Test automated phone order routing.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_crm_integration",
    "title": "CRM integration",
    "description": "Verify customer data syncs to the CRM.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "integrations",
    "phaseNum": 11,
    "key": "integrations_digital_signage_integration",
    "title": "Digital signage integration",
    "description": "Ensure menu boards update from the POS.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_employee_login",
    "title": "Employee login",
    "description": "Train staff on how to clock in and access the POS.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_create_a_new_sale",
    "title": "Create a new sale",
    "description": "Show staff how to ring up items.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_process_a_refund",
    "title": "Process a refund",
    "description": "Train staff on issuing refunds.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_void_a_transaction",
    "title": "Void a transaction",
    "description": "Train staff on voiding mistakes.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_apply_discounts",
    "title": "Apply discounts",
    "description": "Show how to use coupons and manual discounts.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_process_tips",
    "title": "Process tips",
    "description": "Train staff on entering and adjusting tips.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_perform_end_of_day_eod_procedures",
    "title": "Perform end-of-day (EOD) procedures",
    "description": "Show managers how to close the register.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_generate_reports",
    "title": "Generate reports",
    "description": "Train managers on pulling necessary data.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_manage_inventory",
    "title": "Manage inventory",
    "description": "Show how to receive stock and do counts.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_use_the_time_clock",
    "title": "Use the time clock",
    "description": "Ensure staff know how to clock in and out.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_perform_manager_functions",
    "title": "Perform manager functions",
    "description": "Train managers on overrides and cash management.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "training",
    "phaseNum": 12,
    "key": "training_basic_troubleshooting",
    "title": "Basic troubleshooting",
    "description": "Provide tips for common hardware/software issues.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_verify_all_hardware_is_installed",
    "title": "Verify all hardware is installed",
    "description": "Final check of all physical equipment.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_verify_network_connectivity",
    "title": "Verify network connectivity",
    "description": "Ensure all devices are online and stable.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_verify_payment_processing",
    "title": "Verify payment processing",
    "description": "Confirm the system is ready to take real payments.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_verify_products_and_pricing",
    "title": "Verify products and pricing",
    "description": "Final review of the menu and prices.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_confirm_employee_training_is_complete",
    "title": "Confirm employee training is complete",
    "description": "Ensure all staff are comfortable with the system.",
    "audience": "shared",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_verify_reports",
    "title": "Verify reports",
    "description": "Check that reporting is accurate and accessible.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_test_online_ordering",
    "title": "Test online ordering",
    "description": "Place a final test order online.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_verify_backup_internet_connection",
    "title": "Verify backup internet connection",
    "description": "Confirm failover is ready for emergencies.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_enable_remote_support_access",
    "title": "Enable remote support access",
    "description": "Ensure the support team can access the system remotely.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "go_live",
    "phaseNum": 13,
    "key": "go_live_obtain_client_sign_off",
    "title": "Obtain client sign-off",
    "description": "Get the customer's signature approving the installation.",
    "audience": "merchant",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_photograph_completed_installation",
    "title": "Photograph completed installation",
    "description": "Take pictures of the setup for documentation.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": true
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_save_network_diagram",
    "title": "Save network diagram",
    "description": "Document the network topology for future reference.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": true
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_save_terminal_ids",
    "title": "Save terminal IDs",
    "description": "Record the specific IDs for each POS station.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_save_merchant_ids",
    "title": "Save merchant IDs",
    "description": "Record the MIDs for support purposes.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_back_up_router_configuration",
    "title": "Back up router configuration",
    "description": "Save the final network settings.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_document_ip_addresses",
    "title": "Document IP addresses",
    "description": "Log all static IP assignments.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_upload_installation_notes",
    "title": "Upload installation notes",
    "description": "Add any relevant details to the project file.",
    "audience": "ops",
    "autoRule": null,
    "requiresUpload": true
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_schedule_a_24_hour_follow_up",
    "title": "Schedule a 24-hour follow-up",
    "description": "Plan a quick check-in for the next day.",
    "audience": "ops",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_schedule_a_7_day_follow_up",
    "title": "Schedule a 7-day follow-up",
    "description": "Plan a comprehensive review after one week.",
    "audience": "ops",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_schedule_a_30_day_health_check",
    "title": "Schedule a 30-day health check",
    "description": "Plan a final check-in after one month.",
    "audience": "ops",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "post_installation",
    "phaseNum": 14,
    "key": "post_installation_close_installation_ticket",
    "title": "Close installation ticket",
    "description": "Mark the deployment project as complete.",
    "audience": "ops",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_verify_all_stores_report_to_the_enterprise_dashboard",
    "title": "Verify all stores report to the enterprise dashboard",
    "description": "Check multi-store visibility.",
    "audience": "ops",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_confirm_multi_location_synchronization_products_pricing_taxes_and_modifiers",
    "title": "Confirm multi-location synchronization (products, pricing, taxes, and modifiers)",
    "description": "Ensure data pushes to all locations correctly.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_test_offline_mode_and_automatic_synchronization_after_reconnection",
    "title": "Test offline mode and automatic synchronization after reconnection",
    "description": "Verify offline functionality and data sync.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_verify_centralized_reporting_and_user_permissions",
    "title": "Verify centralized reporting and user permissions",
    "description": "Check enterprise-level reports and access.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_test_remote_device_management_and_monitoring",
    "title": "Test remote device management and monitoring",
    "description": "Ensure HQ can manage devices remotely.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_verify_backup_internet_failover",
    "title": "Verify backup internet failover",
    "description": "Confirm enterprise network redundancy.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_confirm_kds_routing_by_kitchen_station",
    "title": "Confirm KDS routing by kitchen station",
    "description": "Check advanced kitchen routing logic.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_validate_label_printing_and_barcode_scanning",
    "title": "Validate label printing and barcode scanning",
    "description": "Ensure enterprise-wide hardware consistency.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_verify_scheduled_tasks_inventory_sync_settlements_and_backups",
    "title": "Verify scheduled tasks (inventory sync, settlements, and backups)",
    "description": "Check automated enterprise processes.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": false
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_record_all_device_serial_numbers_mac_addresses_and_assigned_store_ids",
    "title": "Record all device serial numbers, MAC addresses, and assigned store IDs",
    "description": "Log all hardware details in the central database.",
    "audience": "installer",
    "autoRule": null,
    "requiresUpload": true
  },
  {
    "phase": "airport_enterprise",
    "phaseNum": "airport_enterprise",
    "key": "airport_enterprise_obtain_customer_sign_off_from_both_the_technician_and_store_manager",
    "title": "Obtain customer sign-off from both the technician and store manager",
    "description": "Get final approval for the enterprise deployment.",
    "audience": "merchant",
    "autoRule": null,
    "requiresUpload": false
  }
] as const satisfies readonly DeploymentCatalogItem[];

export const PHASES: DeploymentPhase[] = [
  {
    "id": "pre_installation",
    "num": 1,
    "label": "Pre-Installation"
  },
  {
    "id": "hardware",
    "num": 2,
    "label": "Hardware"
  },
  {
    "id": "network",
    "num": 3,
    "label": "Network"
  },
  {
    "id": "pos_software",
    "num": 4,
    "label": "POS Software"
  },
  {
    "id": "payment",
    "num": 5,
    "label": "Payment"
  },
  {
    "id": "product",
    "num": 6,
    "label": "Product"
  },
  {
    "id": "employee",
    "num": 7,
    "label": "Employee"
  },
  {
    "id": "peripheral",
    "num": 8,
    "label": "Peripheral"
  },
  {
    "id": "functional",
    "num": 9,
    "label": "Functional"
  },
  {
    "id": "reporting",
    "num": 10,
    "label": "Reporting"
  },
  {
    "id": "integrations",
    "num": 11,
    "label": "Integrations"
  },
  {
    "id": "training",
    "num": 12,
    "label": "Training"
  },
  {
    "id": "go_live",
    "num": 13,
    "label": "Go Live"
  },
  {
    "id": "post_installation",
    "num": 14,
    "label": "Post-Installation"
  },
  {
    "id": "airport_enterprise",
    "num": "airport_enterprise",
    "label": "Airport Enterprise"
  }
];

export const DEPLOYMENT_STATUSES: DeploymentStatus[] = ["scheduled","in_progress","hold","completed"];
