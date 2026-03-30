[2.0.10] What's New
## Improvements
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
[2.0.9] What's New
## Requested Changes
- Spa Perimeter Autofill
    - Contract now properly autofills the Spa Perimeter
- Rough Grading
    - Option to enable or disable Rough Grading while Decking is 'Off-Contract"
- Contract Payment Schedule
    - Math for Deposit Amount fixed to reflect correct logic
-----
[2.0.6]
## Requested Changes -
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
[2.0.5]
## Requested Changes - 
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

## Quality of Life Changes
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
[2.0.3]
## Requested Changes - 
- Equipment Package Options
    - Added the ability to create Equipment Packages
    - Can be customized in the admin menu
    - Aligned initial package options
-----
[2.0.2]
## Requested Changes - 
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

## Quality of Life Changes
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

