/*
 * AGENT KYCREADY, as decided (DECISIONS.md D-001 to D-039), modelled for drawing-office.
 *
 * Violet is ours, green is not (ADR 0002 of drawing-office's own palette). One box carries a
 * delivery state, with the decision that says why, and the API server and the system that hold it
 * carry Modified too, so the change shows on every level a reader stops at:
 *   Modified  the nudge writer and assistant: templates until a model is measured for them
 * Built since the first drawing: the document reader (Gemma 4 31B, Sonnet as the fallback, Phase 3)
 * and the trust graph on Neo4j (Phase 5); their decision records stay beside them.
 *
 * The traces are the workflow as decided: onboarding, a fix and the way out, a case a person
 * decides, a licence that lapses, and inside the API server, a decision and a nudge cycle.
 * SIMULATED here: the registries, the push notification (it lands in the app's inbox) and the
 * marketplace (sample loads), as in the demo.
 */
workspace "Agent KYCReady" "An AI-native KYC flow for drivers on a logistics marketplace: AI proposes, a policy decides, people decide the hard cases." {

    model {
        driver = person "Driver" "An owner-driver, a hired driver or a fleet owner, signing up to book loads."
        reviewer = person "Ops reviewer" "Decides the cases the policy sends to a person."

        kyc = softwareSystem "Agent KYCReady" "Nudges drivers through KYC, verifies them, and opens bookings only for verified drivers. modified — hover for details" "Modified" {

            driverApp = container "Driver app" "KYC as a chat: photos, DigiLocker, the Rs 1 check, a selfie. The inbox and the loads." "React and TypeScript"

            opsConsole = container "Ops console" "The review queue, the reasons behind every decision, the nudge log, the funnel and the eval results." "React and TypeScript"

            api = container "API server" "The only place a driver's status changes. modified — hover for details" "Node.js, Express and TypeScript" "Modified" {
                httpApi = component "HTTP API" "Validates every request before anything acts on it." "Express and zod"
                kycService = component "KYC service" "Each driver step: consent, photos, DigiLocker, the Rs 1 check, the selfie, submitting, renewing a licence, booking a load." "TypeScript"
                onboarding = component "Onboarding service" "Applies a decision: the policy's on a submission, a person's on a review. Holds the bookings lock." "TypeScript"
                contract = component "Decision contract" "Hands the policy facts, refuses any answer it can't vouch for, and is the only place a decision is minted." "TypeScript"
                policy = component "Decision policy" "The outcome, reasons and notices for a submission; the photo standard; when a licence is due or lapsed." "Rego on Open Policy Agent, compiled to WebAssembly"
                statusMachine = component "Status machine" "Every allowed move and who may make it. Exactly two ways into approved." "TypeScript"
                nudgeCycle = component "Nudge cycle and send gateway" "Locks lapsed licences, finds each driver's blocker, and decides what may be sent, and when." "TypeScript"
                reader = component "Document reader" "Reads one document photo into fields and flags, signs of editing among them. Decides nothing." "Gemma 4 31B through OpenRouter; Claude Sonnet when Gemma is slow or fails" {
                    !adrs adrs-reader
                }
                writer = component "Nudge writer and assistant" "Drafts nudges and chat replies. The send gateway decides what goes out. modified — hover for details" "Templates today; a model next" "Modified" {
                    !adrs adrs-writer
                }
                registryAdapter = component "Registry adapter" "Licence, PAN, bank and selfie checks, and DigiLocker. Simulated in this project." "TypeScript"
                graphAdapter = component "Trust graph adapter" "Who else is paid into this bank account, and are they a real fleet? No answer means a person decides." "TypeScript; Neo4j, or in memory in tests"
            }

            database = container "KYC database" "Drivers, documents and chat, plus append-only logs of every event and decision." "SQLite" "Data Store"

            trustGraph = container "Trust graph" "Drivers, bank accounts and fleet owners, to tell a fraud ring from a real fleet." "Neo4j Aura" "Data Store" {
                !adrs adrs-trust-graph
            }

            evals = container "Eval harness" "47 made-up drivers with SPECIMEN documents, the gate, the model comparison, real phone photos, IDNet forgeries and the graph parity check. Runs the same compiled policy as the API server." "Node.js and TypeScript"
        }

        openRouter = softwareSystem "OpenRouter" "One API for Claude and for open-weight models." "Existing System"
        registries = softwareSystem "Identity and bank registries" "DigiLocker, the licence and PAN registries, the bank's Rs 1 check, face match. Simulated in this project." "Existing System"
        marketplace = softwareSystem "Load marketplace" "The marketplace's own load booking. Simulated in this project: sample loads." "Existing System"

        /* System and container relationships first, so the component ones below don't imply duplicates
           of them. The driver's two uses of the app are two relationships: that is also what keeps the
           driver on the left in Graphviz, which otherwise breaks the loop the push notification closes
           (API server -> driver -> driver app -> API server) by turning the driver's arrow around. */
        driver -> kyc "Does KYC and books loads with"
        driver -> driverApp "Does KYC with"
        driver -> driverApp "Books loads with"
        reviewer -> opsConsole "Decides review cases with"
        driverApp -> api "Sends photos, answers, submissions and bookings to" "JSON over HTTPS"
        api -> driver "Sends nudges and status updates to" "Push notification (simulated)" "Asynchronous"
        opsConsole -> api "Reads cases and records decisions through" "JSON over HTTPS"
        api -> database "Reads from and appends to" "SQL"
        api -> trustGraph "Asks who shares a bank account" "Cypher over HTTPS (Query API)"
        api -> openRouter "Asks a model to read a document photo" "JSON over HTTPS"
        api -> registries "Checks the licence, PAN, bank account and selfie with" "JSON over HTTPS"
        api -> marketplace "Books loads for approved drivers in" "JSON over HTTPS"
        evals -> openRouter "Runs every model on the same SPECIMEN photos through" "JSON over HTTPS"
        evals -> trustGraph "Checks every decision comes out the same on" "Cypher over HTTPS (Query API)"

        driverApp -> httpApi "Calls" "JSON over HTTPS"
        opsConsole -> httpApi "Calls" "JSON over HTTPS"
        httpApi -> kycService "Hands driver actions to"
        httpApi -> onboarding "Hands a reviewer's decision to"
        kycService -> reader "Asks for a reading of each photo"
        kycService -> registryAdapter "Gathers registry answers through"
        kycService -> graphAdapter "Asks who else uses the bank account"
        kycService -> contract "Asks for a decision on the evidence"
        kycService -> onboarding "Applies the minted decision, and checks the bookings lock, through"
        kycService -> statusMachine "Moves the driver through each step with"
        kycService -> database "Stores documents, answers, chat and bookings in" "SQL"
        kycService -> marketplace "Books loads for approved drivers in" "JSON over HTTPS"
        contract -> policy "Evaluates the facts with"
        onboarding -> statusMachine "Moves the driver through"
        onboarding -> database "Appends the decision and its evidence to" "SQL"
        nudgeCycle -> contract "Asks whether a licence is due or lapsed"
        nudgeCycle -> statusMachine "Moves a driver whose licence lapsed through"
        nudgeCycle -> database "Finds blockers in, and logs every nudge sent or held to" "SQL"
        nudgeCycle -> writer "Asks for a draft from"
        nudgeCycle -> driver "Sends nudges to" "Push notification (simulated)" "Asynchronous"
        reader -> openRouter "Sends the photo to" "JSON over HTTPS"
        registryAdapter -> registries "Checks with" "JSON over HTTPS"
        graphAdapter -> trustGraph "Brings up to date, then asks who is on the account" "Cypher over HTTPS (Query API)"
    }

    /* The views show the outcome of the decisions; the records beside them say why. */
    !adrs adrs

    views {
        systemContext kyc "Context" "Who uses Agent KYCReady, and what it calls." {
            title "System context"
            properties {
                "structurizr.tooltips" "true"
            }
            include *
            autoLayout lr 500 400
        }

        container kyc "Containers" "The two apps, the API server that decides, where data rests, and the eval harness." {
            title "Containers"
            properties {
                "structurizr.tooltips" "true"
            }
            include *
            autoLayout lr 500 400
        }

        component api "Components" "Inside the API server: the AI proposes, the policy decides inside a contract, only the onboarding service applies a decision, and every status move goes through the status machine." {
            title "Inside the API server"
            properties {
                "structurizr.tooltips" "true"
            }
            include *
            autoLayout lr 500 200
        }

        dynamic kyc "Onboard" "A driver, from the first nudge to a first booked load. Step 4: Gemma 4 31B reads the photo, Claude Sonnet if Gemma is slow or fails." {
            title "Onboarding"
            properties {
                "structurizr.tooltips" "true"
            }
            api -> driver "Nudges them at the step they're stuck on"
            driver -> driverApp "Takes a photo of their licence"
            driverApp -> api "Sends the photo"
            api -> openRouter "Asks a model to read it"
            driver -> driverApp "Submits for checking"
            driverApp -> api "Sends the submission"
            api -> registries "Checks the licence, PAN, bank account and selfie"
            api -> database "Records the decision and its evidence"
            api -> driver "Tells them they're approved"
            driver -> driverApp "Books a first load"
            driverApp -> api "Sends the booking"
            api -> marketplace "Books the load, now that the driver is approved"
            autoLayout lr 500 400
        }

        dynamic kyc "Fix" "A decision that needs a fix, and the way out. A third request for the same fix goes to a person instead." {
            title "A fix, and the way out"
            properties {
                "structurizr.tooltips" "true"
            }
            driver -> driverApp "Submits for checking"
            driverApp -> api "Sends the submission"
            api -> registries "Checks the licence, PAN, bank account and selfie"
            api -> database "Records the decision: needs a fix, the bank account is in someone else's name"
            api -> driver "Asks for an account in their own name, opening the app at the bank step"
            driver -> driverApp "Adds their own account and submits again"
            driverApp -> api "Sends the new submission"
            api -> registries "Checks everything again, the new account included"
            api -> database "Records the decision: approved"
            autoLayout lr 500 400
        }

        dynamic kyc "Review" "A case the policy can't settle, decided by a person: the second way into approved." {
            title "A person decides"
            properties {
                "structurizr.tooltips" "true"
            }
            driverApp -> api "Submits a case the policy sends to a person"
            api -> database "Queues it for review, with the reasons"
            reviewer -> opsConsole "Approves it, or asks for a fix and picks the step to redo"
            opsConsole -> api "Records the reviewer's decision"
            api -> database "Moves the driver to Approved and logs who decided"
            api -> driver "Tells them they're approved, or opens their app at the step to redo"
            autoLayout lr 500 400
        }

        dynamic kyc "Lapse" "A licence runs out after approval: bookings lock until a renewed licence passes the rules." {
            title "A licence lapses"
            properties {
                "structurizr.tooltips" "true"
            }
            api -> database "Moves a driver whose licence lapsed to Licence expired, which locks bookings"
            api -> driver "Asks for the renewed licence"
            driver -> driverApp "Fetches the renewed licence from DigiLocker"
            driverApp -> api "Resubmits"
            api -> registries "Checks the renewed licence"
            api -> database "Records the decision: approved again"
            driver -> driverApp "Books a load again"
            driverApp -> api "Sends the booking"
            api -> marketplace "Books the load"
            autoLayout lr 500 400
        }

        dynamic api "Decide" "Inside the API server when a driver submits." {
            title "Inside a decision"
            properties {
                "structurizr.tooltips" "true"
            }
            httpApi -> kycService "Hands over the submission"
            kycService -> registryAdapter "Gathers registry answers"
            registryAdapter -> registries "Checks the licence, PAN, bank account and selfie"
            kycService -> graphAdapter "Asks who else uses the bank account"
            graphAdapter -> trustGraph "Brings the graph up to date and asks; no answer sends the case to a person"
            kycService -> contract "Asks for a decision on the evidence"
            contract -> policy "Evaluates the facts"
            kycService -> onboarding "Applies the minted decision"
            onboarding -> statusMachine "Moves the driver"
            onboarding -> database "Appends the decision and its evidence"
            autoLayout lr 500 400
        }

        dynamic api "Nudge" "The nudge cycle, each tick of the clock (a daily job in production): at most one nudge per driver every two days, nothing between 9 pm and 8 am." {
            title "The nudge cycle"
            properties {
                "structurizr.tooltips" "true"
            }
            nudgeCycle -> contract "Asks whether any approved driver's licence has lapsed"
            nudgeCycle -> statusMachine "Moves each one to Licence expired"
            nudgeCycle -> database "Finds each driver's blocker and their last nudge"
            nudgeCycle -> writer "Asks for a draft for that blocker"
            nudgeCycle -> driver "Sends it, unless it's night or under two days since the last one"
            nudgeCycle -> database "Logs what was sent and what was held, and why"
            autoLayout lr 500 400
        }

        /* GENERATED FROM architecture/theme.json by checks/diagram-contrast.mjs --write.
           Edit the theme, not this block: the check refuses any drift between them. */
        styles {
            element "Element" {
                color #ffffff
                strokeWidth 2
                fontSize 26
            }
            element "Person" {
                shape Person
                background #32433b
                stroke #6fa588
            }
            element "Existing System" {
                background #32433b
                stroke #6fa588
            }
            element "Software System" {
                background #494d97
                stroke #a5a9f0
            }
            element "Container" {
                background #5f64af
                stroke #b9bdf5
            }
            element "Component" {
                background #8b92ce
                stroke #d2d5fa
                color #14162b
            }
            element "Data Store" {
                shape Cylinder
                background #5f64af
                stroke #b9bdf5
            }
            element "Channel" {
                shape Pipe
                background #5f64af
                stroke #b9bdf5
            }
            element "Infrastructure Node" {
                background #5f64af
                stroke #b9bdf5
                color #ffffff
            }
            element "Modified" {
                stroke #ffb454
                strokeWidth 4
            }
            element "Proposal" {
                stroke #ff2fd0
                strokeWidth 6
            }
            element "Container Instance" {
            }
            element "Software System Instance" {
            }
            relationship "Relationship" {
                color #d7dbe3
                fontSize 24
                dashed false
            }
            relationship "Asynchronous" {
                color #d7dbe3
                fontSize 24
                dashed true
            }
        }
    }
}
