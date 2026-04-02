## [2.2.0] - 4/1/26
### Proposal Submission Workflow
    - Submitting a Proposal now locks the Submited Proposal from edits, and can then be viewed by an Admin or Book Keeper for Approval
    - All Proposals are saved in a 'Draft' until they are manually Submitted
        - Additional versions of the Submitted Proposal can still be created and replace the current submission
        - Designers can still create multiple versions before submitting their intended version
    - A Sumbitted Proposal can be 'Approved' or 'Returned with Notes' by an Admin / Book Keeper
        - If a Proposal is 'Approved': Any changes made by the designer afterwards are separated into a new version; Proposal Addendum
            - A Proposal Addendum allows the Admin / Book Keeper to quickly see changes made to the originally Approved Proposal
            - Proposal Addendum must also be Approved after it is submitted
        - If a Proposal is 'Returned with Notes': Designers can resubmit a new version after changes are made
    - Approved Proposals (and Proposal Addendums) still need to be marked as 'Completed' by an Admin or Book Keeper
        - Completed Proposals cannot be modified after marking as 'Complete'. This should be done after the build
        - Completed Proposals are reconsiled in the Archive of the Book Keeper tab
### New 'Book Keeper' Role
    - Book Keeper Role can be assigned by an Admin or Owner in the Admin Tab
    - Book Keeper Tab gives a quick comparison view of Proposal differences
    - Book Keeper Role has the ability to review and process Submitted Proposals
        - *This section will continue to be improved*
### Fiberglass Introduction - *Rolling*
    - Fiberglass Pool Models introduced into the workflow and engine (excel reference)
        - Options can be configured by the Admin
    - Contract correctly updates with Deposit breakdown and Fiberglass selection
    - Important Excel Notes:
        - Plumbing cost was always reduced to 40% of the normal subtotal cost
        - Steel cost is forced to 0
        - Shotcrete cost is forced to 0
        - Tile cost is forced to 0
        - Interior Finish cost is forced to 0
        - Tile Coping adds Concrete Band (Fiber pool count * perimeter * 1.25)
-----
## [2.1.3] - 4/1/26
### Improvements
- Feedback Button Tutorial (1st time only)
-----
## [2.1.1] - 3/31/26
### Security Changes
- Only 1 logged in session per user can be active at a time
    - Will prompt to sign other session out if 2 active logins are detected
- Moved Admin-only settings into the Admin Tab in the new 'Admin Settings' area
    - Change App Name, Franchise Code, Admin PIN, & Hide COGS view
- Active ledger logs milestone events per franchise (server side)
    - Logs User, Role, Time, and Action conducted
        - Action examples: Creating a new user, deleting a user, promoting a user to admin, etc
### Improvements
- User Profile Section
    - Clicking the 'Profile Settings' option from the User Block (Your Name) opens a new Profile section
    - Edit Name, Email, and Reset Password
- Feedback Button
    - Leave feedback for improvements, issues, and feature requests all within the app
    - Feedback Button is located persistently in the bottom right corner of the app
- Proposal Table UI
    - Removed the Proposal Tab and replaced it with the Dashboard Proposal Table
    - Filter Customer Name, Status, Pricing Mode, and Contract Type
    - Ability to 'Hide Table' from view
### Requested Changes
- Warranty Breakdown
    - Polished the look of the PDF when exporting & printing
    - Included all changes and logic requested for the updated breakdown
- Contract
    - New 'Additional Features' mapped to the Contracts
        - *Only Bubblers autofill currently*
- Customer Job Cost Summary
    - Decking no longer appears in this summary if "Off Contract" is active
-----
## [2.0.18] - 3/31/26
## Changes
- App Name now updates to the Franchise name
- Designer 'Customer Cost Breakdown' button aligned with Admins' button
-----
## [2.0.17] - 3/31/26
## Fixes
- Exporting Contract & Warranty PDF fixed
-----
## [2.0.16] - 3/31/26
- Warranty Customization
    - Added ability to customize the Warranty section of the Job Cost Summary
    - Left click a category or line item to edit the field
    - Right click a category or line item to Add / Remove items to the category
- Exporting Options
    - Job Cost Summary & Warranty export logic now matches the Contract export logic
-----
## [2.0.15] - 3/31/26
-  Aligned Additional Decking with intended use case
    - Ability to add multiple decking options
    - Changed Concrete Waste overhead to 0%
-----
## [2.0.14] - 3/31/26
- Additional Decking Options
    - Ability to add Additional Decking options
    - Independant 'Off Contract' & 'Remove Waste' logic
    - Custom SQFT input field for selected option
- Freeform or Geometric Pool
    - Option to select if pool is Freeform or Geometric
        - Freeform: Adds 5% overhead to the Decking category (Not for Concrete selection)
        - Bills as line item 'Freeform Decking Overhead'
- Grouped Custom Pricing
    - Sod and Fencing included as Subcategories in Grouped Pricing
    - Configurable with Set Price or Price Per SQFT
        - Ability to include extra costs (Gates) per Subcategory
-----
## [2.0.13] - 3/30/26
- Master Tab Update
- Commission Amount adjustable per user
    - Admins can configure default Commission Amount
-----
## [2.0.12]
- Off Contract Decking
    - Takes original decking cost and moves it straight to Total Retail, no increase
    - Marks the Decking as 'Off Contract' in the COGS and Contract
    - Includes itself in the Off Contract Addendum
-----
## [2.0.10]
- Auxillary Pump logic with Spa
    - Automatically adds Aux Pump with spa (default set by admin)
    - Populates in 'Blower' input of contract (page 2)
        - Auxillary Pumps not added by a spa populate in 'Auxillary Pump II'
- Proposal Summary
    - Chosen Equipment Package now displays in the summary
    - Pump no longer populates with Auxillary Pump
- Contract Exporting
    - Recent changes are saved after clicking 'Export'
        - No need to 'Save' before clicking Export anymore
- Admin Pricing Menu Redesign
    - Redesigned the UI of the Admin Pricing Model
-----
## [2.0.9]
- Spa Perimeter Autofill
    - Contract now properly autofills the Spa Perimeter
- Rough Grading
    - Option to enable or disable Rough Grading while Decking is 'Off-Contract"
- Contract Payment Schedule
    - Math for Deposit Amount fixed to reflect correct logic
-----
## [2.0.6]
- Swapped Backside Facing from Exposed Pool Wall to RBB
- Fixed Edit Proposal crash
- Parched Concrete changed to Parged Concrete
- 5 Year Warranty cost inclusion
- Contract Autofill
    - Surface Returns
    - Decking SQFT
    - Downspout SQFT
    - Coping Size
    - Custom Features
-----
## [2.0.5]
- Valve Actuator toggle per Water Feature zone
    - Included a checkbox next to each added water feature to turn off the Valve Actuator cost
- Wok Pot logic cleanup
    - Water & Fire and Fire Wok Pots now ask for a gas run with the Water Feature run
- Laminier Jet logic
    - Laminier Jet requires conduit run
    - Admin can select which Jets need conduit
- Water Feature pipe size
    - Aligned all Water Features and additionals use 2" pipe
- Deposit Breakdown in Contract
    - Properly autofills the payment schedule when a deposit amount is entered
- Custom Features Off-Contract & Grouped Features
    - Custom Features can now be marked Off-Contract
    - Grouped Custom Features can be created by an admin (sod, fencing)
-----
## [2.0.4]
- Zoom Toggle on contract preview
    - Can zoom the contract in and out while previewing
- Price Model in proposal builder
    - Adjusted size and look of price model dropdown in the top of the builder
- Admin setting to 'Hide' COGS in Proposal Builder
    - Admins can now toggle On/Off the ability to view the COGS breakdown while building a proposal
        - This includes the COGS button in the Prop builder and the COGS block in the summary screen
- Changelog
    - Admins and Owners are now greeted with the Changelog if the app was updated
-----
## [2.0.3]
- Equipment Package Options
    - Added the ability to create Equipment Packages
    - Can be customized in the admin menu
    - Aligned initial package options
-----
## [2.0.2]
- Plumbing Cost Update
    - Aligned with new prices and exposed options to edit in the Admin Panel
- Exposed Pool Wall (Out of Ground Forming)
    - Added Exposed Pool Wall subcategory to Excavation
    - Same input options as selecting RBB
    - Only the RBB Forming cost bills for the Exposed Pool Wall, in addition to Strip Forms cost per LNFT
        - *Does not include base Strip Form Cost*
    - Added Backside Facing toggle (doubles the facing cost)
        - Added Parched Concrete facing option
- Pool Bonding billed to Excavation category in COGS
    - Pool bonding now bills as LNFT perimeter of pool @ $2ft, 10% overhead. Editable
    - *Pool Bonding used to bill $500 in Steel & $125 in Equipment Set*
- Blower Equipment Subcategory in Proposal Builder
    - Added "Auxillary Pump" to equipment section, defaults with Spa. Fixed additional main drain
- Default Pool Lights
    - Pool Lights now default to 2 Pool Lights, Spa defaults to 1 Spa Light
    - Can edit which lights are default in Admin Panel
- HydraPure Sanitation additional add-on
    - Added an "Additional Options" dropdown to include add-ons
    - Can be configured in the Admin Panel
- LED Bubbler & Conduit Run, Pool Light cost
    - Pool Lights will now bill with specific Bubblers, set in Admin Panel
        - Designer will see a UI prompt notifying them a Light has been included
    - Conduit Run now appears as an input - same value as WF run - and bills the Plumbing Conduit cost
- Valve Actuator per Water Feature Zone
    - Valve Actuator Cost is now an input in the Admin Panel (Misc. Plum)
    - 1 Valve Actuator is billed per unique category of Water Features
        - Ex: 2 Wok Pots bills with 1 Valve Actuator. 1 Wok Pot & 1 Jet bills with 2 Valve Actuators
- Auto-Fill Electric Runs
    - Admin can edit which Auto-Fill systems require an Electric Run
    - Electric Run is mirrored to the Auto-Fill Run value, and bills as an electric run
- Travertine Level 3 - Decking
    - Added Travertine Level 3 decking option
    - *Admin will be able to add / remove levels in a future update*
- Default Cleaner
    - Admin can select a default Cleaner option (Polaris 7240)
- Automation and Sanitation System logic
    - Admin can select which Automation Systems include a "Salt Cell"
        - When a designer selects one of these Automation Systems, the Sanitation Systems update to only display Additional Options
    - If an Automation System is selected that does not include a Salt Cell, All Sanitation System options remain
    - HydraPure UV locatated in Additional Options of Sanitation System
- Off-Contract Custom Option
    - Added ability to input "Off-Contract" costs inside each Custom Options category
        - Off Contract items are NOT billed to COGS and do NOT appear inside of the COGS breakdown or Contract
        - Off Contract items are broken down in a separate block (temporary) in the Proposal Summary screen
        - Off Contract items are billed directly to the Retail Cost (without increase) so margin is unaffected
    - Added specific Off-Contract toggle for the Decking category
        - Removes any costs associated with Decking and routes the Off Contract Decking Cost input directly to the Retail Cost
        - Does not appear as a line item in COGS, appears in separate block in the Proposal Summary Screen
        - Contract autocomplete for decking fills as "OFF CONTRACT"
- Strip Forms RBB Additional Cost
    - Strip Forms now bill additional $2.5 per LNFT of RBB
    - Admin can edit price in Misc. Plumbing of Admin Panel
    - *Used to bill flat $700*
- Retail Increase % adjustment option
    - Added input field to adjust retail price % increase in the Admin Panel
        - COGS vs Retail Price Increase
-----
## [2.0.0]
- Admin Price Menu Update
    - Every input has a label and tooltip describing what the input does
        - If an input appears in a Red background, it is not currently used
    - Ability to rename Additional Cost Columns for clarity
- Save Draft button
    - Save Draft now appears in the proposal builder
        - Takes desginer directly to summary screen in a 'Draft' state
- Price Model location
    - Moved Price Model selection to the top of the proposal builder, persistent
-  Facing Options for RBB and Exposed Pool Wall
    - Can now add/remove facing options for RBB and EPW
    - Material Costs and labor can be changed in the same table