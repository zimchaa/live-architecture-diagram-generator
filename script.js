
// ===================================================================
// LIVE ARCHITECTURE DIAGRAM GENERATOR - MAIN SCRIPT
// ===================================================================
// This application generates PlantUML and Mermaid diagrams from JSON input
// It supports Component PUML, C4 PUML, and Mermaid diagram types

// --- INITIALIZATION & SCHEMA DEFINITION ---
// JSON schema for validating the input architecture data
const schema = {
    "description": "An architecture system heirarchy for use in diagraming, e.g. PlantUML",
    "type": "object",
    "required": ["title", "project", "subsystems"],
    "properties": {
        "title": { "type": "string" },
        "project": { "type": "string" },
        "subsystems": { "type": "array", "items": { "$ref": "#/$defs/subsystem" } }
    },
    "$defs": {
        "subsystem": {
            "type": "object",
            "required": ["id", "name"],
            "properties": {
                "id": { "type": "string", "pattern": "^[0-9A-Z\\.]{2,20}$" },
                "name": { "type": "string" },
                "type": { "type": "string", "enum": ["component", "artifact", "card", "cloud", "database", "file", "folder", "frame", "hexagon", "node", "package", "queue", "rectangle", "stack", "storage", "actor"] },
                "notes": { "type": "string" },
                "state": { "type": "string", "enum": ["unchanged", "decomm", "config", "modified", "new"] },
                "conns": { "type": "array", "items": { "$ref": "#/$defs/connection" } },
                "subsystems": { "type": "array", "items": { "$ref": "#/$defs/subsystem" } }
            }
        },
        "connection": {
            "type": "object",
            "required": ["to", "desc"],
            "properties": {
                "to": { "type": "string", "pattern": "^[0-9A-Z\\.]{2,20}$" },
                "desc": { "type": "string" },
                "freq": { "type": "string" },
                "state": { "type": "string", "enum": ["unchanged", "decomm", "config", "modified", "new"] },
                "start": { "type": "string", "enum": ["<", "*", "o", "+", "#", "<<", "0", "^", "0)"] },
                "end": { "type": "string", "enum": [">", "*", "o", "+", "#", ">>", "0", "^", "(0"] },
                "dir": { "type": "string", "enum": ["u", "d", "l", "r"] }
            }
        }
    }
};

// Sample JSON data for demonstration
const sampleJson = {
    "title": "Sample E-commerce System",
    "project": "Project Phoenix - Live Demo",
    "subsystems": [
        { "id": "USER", "name": "End User", "type": "actor", "state": "unchanged" },
        {
            "id": "WEB",
            "name": "Web Front-End",
            "type": "package",
            "state": "modified",
            "notes": "Main customer-facing portal.",
            "conns": [{ "to": "API", "desc": "HTTPS/JSON", "freq": "Real-time", "state": "modified" }],
            "subsystems": [
                { "id": "WEB.UI", "name": "React UI", "type": "component", "state": "new", "notes": "New SPA replacing legacy system." },
                { "id": "WEB.AUTH", "name": "Auth Service", "type": "component", "state": "config" }
            ]
        },
        {
            "id": "API",
            "name": "API Gateway",
            "type": "hexagon",
            "state": "modified",
            "conns": [
                { "to": "ORDER.SVC", "desc": "Processes orders", "state": "new" },
                { "to": "PAY.GW", "desc": "Processes payments", "dir": "r" }
            ]
        },
        { "id": "ORDER.SVC", "name": "Ordering Service", "type": "component", "state": "new", "notes": "Handles order logic." },
        { "id": "PAY.GW", "name": "Payment Gateway", "type": "card", "state": "unchanged", "notes": "External system." },
        { "id": "LEGACY.SYS", "name": "Legacy Billing", "type": "database", "state": "decomm", "notes": "To be decommissioned." }
    ]
};

// --- DOM ELEMENTS INITIALIZATION ---
// Get references to all the important DOM elements
const jsonInput = document.getElementById('json-input');
const jsonStatus = document.getElementById('json-status');
const generateBtn = document.getElementById('generate-btn');

// Checkbox elements for diagram type selection
const cbPuml = document.getElementById('cb-puml');
const cbC4 = document.getElementById('cb-c4');
const cbMermaid = document.getElementById('cb-mermaid');

// Output textarea elements for generated scripts
const pumlOutput = document.getElementById('puml-output');
const c4Output = document.getElementById('c4-output');
const mermaidOutput = document.getElementById('mermaid-output');

// --- EXTERNAL LIBRARIES INITIALIZATION ---
// Initialize AJV JSON schema validator
const Ajv = window.ajv7;
const ajv = new Ajv();
const validate = ajv.compile(schema);

// Initialize Mermaid diagram renderer
mermaid.initialize({ startOnLoad: false });

// ===================================================================
// DIAGRAM GENERATOR CLASS
// ===================================================================
// Main class responsible for converting JSON data into diagram scripts
class DiagramGenerator {
    constructor(data) {
        this.data = data;
        this._initializeState();
        this._setupStyles();
    }

    // Initialize all state variables used during diagram generation
    _initializeState() {
        // Connection tracking
        this.conn_count = 1;

        // PlantUML specific arrays
        this.puml_connections = [];
        this.puml_sys_table_rows = [];
        this.puml_conn_table_rows = [];

        // C4 specific arrays
        this.c4_definitions = [];
        this.c4_relationships = [];

        // Mermaid specific arrays
        this.mermaid_elements = [];
        this.mermaid_connections = [];
        this.mermaid_styles = [];
    }

    // Set up color schemes and styling for different states
    _setupStyles() {
        // Background colors for different system states
        this.bg_colors = {
            "unchanged": "#PaleGreen",
            "config": "#LightYellow",
            "modified": "#Khaki",
            "new": "#LightSalmon",
            "decomm": "#LightBlue",
            " ": "#White"
        };

        // Text colors for different system states
        this.txt_colors = {
            "unchanged": "Green",
            "config": "Orange",
            "modified": "DarkOrange",
            "new": "DarkRed",
            "decomm": "Blue",
            " ": "Black"
        };

        // Table headers for PlantUML legends
        this.puml_sys_table_header = "|= ID |= Name |= Notes |";
        this.puml_conn_table_header = "|= ID |= From | |= To |= Description |";

        // Font sizes for different elements
        this.small_font_size_color = 10;
        this.large_font_size_color = 10;
    }

    // Format a single system for PlantUML output
    _formatPumlSystem(sys) {
        const s_id = sys.id;
        const s_name = sys.name;
        const s_state = sys.state || 'unchanged';
        const s_type = sys.type || 'component';
        const s_notes = sys.notes || '';

        // Add system to table if it has notes
        if (s_notes) {
            this.puml_sys_table_rows.push(
                `|<${this.bg_colors[s_state]}> <color:${this.txt_colors[s_state]}><i>[${s_id}]</i></color> | <color:${this.txt_colors[s_state]}>${s_name}</color> | ${s_notes} |`
            );
        }

        // Return PlantUML component definition
        return `${s_type} "**${s_name}**\\n<size:${this.small_font_size_color}><i>[${s_id}]</i></size>" as ${s_id} <<${s_state}>>`;
    }

    // Format a connection between systems for PlantUML
    _formatPumlConnection(from_id, conn) {
        const to = conn.to;
        const desc = conn.desc;
        const freq = conn.freq || 'Real-time';
        const state = conn.state || 'unchanged';
        const dir = conn.dir || 'd';

        // Generate connection number for tracking
        const c_num_str = String(this.conn_count++).padStart(2, '0');

        // Choose line style based on state (dotted for new/modified)
        const line_char = ['new', 'modified'].includes(state) ? '..' : '--';
        const table_line_char = ['new', 'modified'].includes(state) ? '<U+2505>' : '<U+2501>';
        const c_line = `${line_char[0]}-${dir}-${line_char[1]}`;

        // Add connection to table
        this.puml_conn_table_rows.push(
            `|<${this.bg_colors[state]}> <color:${this.txt_colors[state]}><i>[CN.${c_num_str}]</i> | [${from_id}] |<color:${this.txt_colors[state]}> ${table_line_char} </color>| [${to}] | <color:${this.txt_colors[state]}>${desc}: <i>${freq}</i></color> |`
        );

        // Return PlantUML connection definition
        return `${from_id} ${c_line} ${to} <<${state}>> : <b>${desc}</b>\\n<size:${this.large_font_size_color}><i>${freq} [CN.${c_num_str}]</i></size>`;
    }

    // Recursively process subsystems for PlantUML
    _processPumlSubsystems(subsystems, indent = 0) {
        let output = [];
        const prefix = "  ".repeat(indent);

        for (const sys of subsystems) {
            let system_def = prefix + this._formatPumlSystem(sys);

            // Process connections for this system
            if (sys.conns) {
                for (const conn of sys.conns) {
                    this.puml_connections.push(this._formatPumlConnection(sys.id, conn));
                }
            }

            // Handle nested subsystems
            const has_subsystems = sys.subsystems && sys.subsystems.length > 0;
            if (has_subsystems) {
                output.push(system_def + " {");
                output.push(...this._processPumlSubsystems(sys.subsystems, indent + 1));
                output.push(prefix + "}");
            } else {
                output.push(system_def);
            }
        }

        return output;
    }

    // Generate complete PlantUML component diagram
    generatePlantUML() {
        this._initializeState();
        this._setupStyles();

        // Header with title and styling
        let header = `@startuml
title ${this.data.title}
footer Project: ${this.data.project}

hide stereotype
skinparam padding 2

<style>
componentDiagram { fontsize: 12 }
.unchanged { fontcolor: ${this.txt_colors["unchanged"]}; linecolor: ${this.txt_colors["unchanged"]}; backgroundcolor: ${this.bg_colors["unchanged"]} }
.decomm { fontcolor: ${this.txt_colors["decomm"]}; linecolor: ${this.txt_colors["decomm"]}; backgroundcolor: ${this.bg_colors["decomm"]} }
.config { fontcolor: ${this.txt_colors["config"]}; linecolor: ${this.txt_colors["config"]}; backgroundcolor: ${this.bg_colors["config"]} }
.modified { fontcolor: ${this.txt_colors["modified"]}; linecolor: ${this.txt_colors["modified"]}; backgroundcolor: ${this.bg_colors["modified"]} }
.new { fontcolor: ${this.txt_colors["new"]}; linecolor: ${this.txt_colors["new"]}; backgroundcolor: ${this.bg_colors["new"]} }

legend { backgroundcolor: white }
</style>

`;

        // Generate system definitions and connections
        const system_defs = this._processPumlSubsystems(this.data.subsystems).join('\n\n');
        const connections = this.puml_connections.join('\n');

        // Generate legends with tables
        let sys_table = `**Systems & Components**
${this.puml_sys_table_header}
${this.puml_sys_table_rows.sort().join('\n')}`;

        let conn_table = `**Connections**
${this.puml_conn_table_header}
${this.puml_conn_table_rows.sort().join('\n')}`;

        // Combine all parts
        return `${header}

${system_defs}

${connections}

legend right
${sys_table}

${conn_table}

**Legend**
|=     |= Status |= |
|<${this.bg_colors["unchanged"]}>  | <color:${this.txt_colors["unchanged"]}>Config. Only</color> | <color:${this.txt_colors["unchanged"]}><U+2501> ></color> |
|<${this.bg_colors["config"]}>  | <color:${this.txt_colors["config"]}>Config. Only</color> | <color:${this.txt_colors["config"]}><U+2501> ></color> |
|<${this.bg_colors["modified"]}> | <color:${this.txt_colors["modified"]}>Modified</color>   | <color:${this.txt_colors["modified"]}><U+2505> ></color> |
|<${this.bg_colors["new"]}> | <color:${this.txt_colors["new"]}>New</color> | <color:${this.txt_colors["new"]}><U+2505> ></color> |
|<${this.bg_colors["decomm"]}> | <color:${this.txt_colors["decomm"]}>Decommissioned</color> | <color:${this.txt_colors["decomm"]}><U+2501> ></color> |
end legend

@enduml`;
    }

    // Recursively process subsystems for C4 diagrams
    _processC4Subsystems(subsystems) {
        for (const sys of subsystems) {
            const s_id = sys.id;
            const s_name = sys.name;
            const s_type = sys.type || 'component';
            const s_notes = sys.notes || '';
            const s_state = sys.state || 'unchanged';
            const tag = `$tags="${s_state}"`;

            // Handle different system types for C4
            if (sys.subsystems && sys.subsystems.length > 0) {
                // Container system with subsystems
                this.c4_definitions.push(`System_Boundary("${s_id}", "${s_name}", ${tag}) {`);
                this._processC4Subsystems(sys.subsystems);
                this.c4_definitions.push('}');
            } else if (s_type === 'actor') {
                // Person/Actor
                this.c4_definitions.push(`Person("${s_id}", "${s_name}", "${s_notes}", ${tag})`);
            } else if (s_type === 'database') {
                // Database container
                this.c4_definitions.push(`ContainerDb("${s_id}", "${s_name}", "Database", "${s_notes}", ${tag})`);
            } else {
                // Regular system or container
                if (s_id.includes('.')) {
                    this.c4_definitions.push(`Container("${s_id}", "${s_name}", "${s_type}", "${s_notes}", ${tag})`);
                } else {
                    this.c4_definitions.push(`System("${s_id}", "${s_name}", "${s_notes}", ${tag})`);
                }
            }

            // Process connections for this system
            if (sys.conns) {
                for (const conn of sys.conns) {
                    const label = `${conn.desc} [${(conn.state || 'unchanged').charAt(0).toUpperCase() + (conn.state || 'unchanged').slice(1)}]`;
                    this.c4_relationships.push(`Rel("${s_id}", "${conn.to}", "${label}", "${conn.freq || ''}")`);
                }
            }
        }
    }

    // Generate complete C4 PlantUML diagram
    generateC4PlantUML() {
        this._initializeState();
        this._setupStyles();

        // Header with C4 includes and title
        let header = `@startuml
!include <C4/C4_Container>

title ${this.data.title}
`;

        // Generate style tags for different states
        let tags = Object.keys(this.bg_colors)
            .filter(k => k.trim())
            .map(state => `AddElementTag("${state}", $bgColor="${this.bg_colors[state]}", $fontColor="${this.txt_colors[state]}", $borderColor="${this.txt_colors[state]}")`)
            .join('\n');

        // Process all subsystems
        this._processC4Subsystems(this.data.subsystems);

        // Combine all parts
        return `${header}

${tags}

${this.c4_definitions.join('\n')}

${this.c4_relationships.join('\n')}

legend right
**Legend**
|=     |= Status |= |
|<${this.bg_colors["unchanged"]}>  | <color:${this.txt_colors["unchanged"]}>Config. Only</color> | <color:${this.txt_colors["unchanged"]}><U+2501> ></color> |
|<${this.bg_colors["config"]}>  | <color:${this.txt_colors["config"]}>Config. Only</color> | <color:${this.txt_colors["config"]}><U+2501> ></color> |
|<${this.bg_colors["modified"]}> | <color:${this.txt_colors["modified"]}>Modified</color>   | <color:${this.txt_colors["modified"]}><U+2505> ></color> |
|<${this.bg_colors["new"]}> | <color:${this.txt_colors["new"]}>New</color> | <color:${this.txt_colors["new"]}><U+2505> ></color> |
|<${this.bg_colors["decomm"]}> | <color:${this.txt_colors["decomm"]}>Decommissioned</color> | <color:${this.txt_colors["decomm"]}><U+2501> ></color> |
end legend


@enduml`;
    }

    // Recursively process subsystems for Mermaid diagrams
    _processMermaidSubsystems(subsystems, indent = 0) {
        const prefix = "  ".repeat(indent);

        // Add individual element
        const typeMapping = {
            "component": "proc",
            "artifact": "docs",
            "card": "notch-rect",
            "cloud": "trap-b",
            "database": "cyl",
            "file": "doc",
            "folder": "win-pane",
            "frame": "fr-rect",
            "hexagon": "hex",
            "node": "circle",
            "package": "stadium",
            "queue": "lin-rect",
            "rectangle": "rect",
            "stack": "st-rect",
            "storage": "h-cyl",
            "actor": "dbl-circ"
        };

        for (const sys of subsystems) {
            // Replace dots in IDs for Mermaid compatibility
            const s_id = sys.id.replace(/\./g, '_');
            const is_subgraph = sys.subsystems && sys.subsystems.length > 0;

            // Handle subgraphs (systems with subsystems)
            if (is_subgraph) {
                this.mermaid_elements.push(`${prefix}subgraph ${s_id} ["**${sys.name}** [${sys.id}]: ${sys.state || ''}"]`);
                this._processMermaidSubsystems(sys.subsystems, indent + 1);
                this.mermaid_elements.push(`${prefix}end`);
            }

            this.mermaid_elements.push(`${prefix} ${s_id}@{ shape: ${typeMapping[sys.type] || 'rect'}, label: "**${sys.name}**<br/><i>[${sys.id}]</i>"}`);
            this.mermaid_styles.push(`class ${s_id} ${sys.state || 'unchanged'};`)

            // Process connections
            if (sys.conns) {
                for (const conn of sys.conns) {
                    // Choose line style based on connection state
                    const line = ['new', 'modified'].includes(conn.state) ? '-.->' : '-->';
                    this.mermaid_connections.push(`    ${s_id} ${line}|"${conn.desc} <i>(${conn.state || ''})</i>"| ${conn.to.replace(/\./g, '_')}`);
                }
            }
        }
    }

    // Generate complete Mermaid flowchart
    generateMermaid() {
        this._initializeState();
        this._setupStyles();

        // Header with title and flowchart directive
        let header = `---
title: ${this.data.title}
---
flowchart TD`;

        // Process all subsystems
        this._processMermaidSubsystems(this.data.subsystems);

        // Generate class definitions for styling
        const styles = Object.keys(this.bg_colors)
            .filter(k => k.trim())
            .map(state => `classDef ${state} fill:${this.bg_colors[state]},stroke:${this.txt_colors[state]},stroke-width:2px,color:${this.txt_colors[state]}`)
            .join('\n');

        // Combine all parts with mermaid code block wrapper
        return `${header}
        
${this.mermaid_elements.join('\n')}

${this.mermaid_connections.join('\n')}

${styles}

${this.mermaid_styles.join('\n')}
`;
    }
}

// ===================================================================
// PAN/ZOOM CONTROLLER
// ===================================================================
// Lightweight pan and zoom for the rendered diagrams.
// Applies a CSS transform (translate + scale) to the .preview-content child.
class PanZoom {
    constructor(viewport) {
        this.viewport = viewport;
        this.content = viewport.querySelector('.preview-content');
        this.indicator = viewport.querySelector('.zoom-indicator');
        this.scale = 1;
        this.tx = 0;
        this.ty = 0;
        this.minScale = 0.1;
        this.maxScale = 10;
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
        this._enabled = false;

        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onWheel = this._onWheel.bind(this);

        this.viewport.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mouseup', this._onMouseUp);
        this.viewport.addEventListener('wheel', this._onWheel, { passive: false });
    }

    setEnabled(enabled) {
        this._enabled = enabled;
        this.viewport.style.cursor = enabled ? 'grab' : 'default';
    }

    apply() {
        this.content.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
        if (this.indicator) {
            this.indicator.textContent = `${Math.round(this.scale * 100)}%`;
        }
    }

    reset() {
        this.scale = 1;
        this.tx = 0;
        this.ty = 0;
        this.apply();
    }

    // Fit the content into the viewport while preserving aspect ratio.
    fit() {
        const child = this.content.firstElementChild;
        if (!child) {
            this.reset();
            return;
        }

        // Determine the natural / unscaled size of the diagram.
        const prevTransform = this.content.style.transform;
        this.content.style.transform = 'translate(0,0) scale(1)';
        const cw = this.content.offsetWidth || child.getBoundingClientRect().width;
        const ch = this.content.offsetHeight || child.getBoundingClientRect().height;
        this.content.style.transform = prevTransform;

        const vw = this.viewport.clientWidth;
        const vh = this.viewport.clientHeight;
        if (!cw || !ch || !vw || !vh) {
            this.reset();
            return;
        }

        // Leave a small margin around the diagram.
        const padding = 20;
        const scale = Math.min(
            (vw - padding * 2) / cw,
            (vh - padding * 2) / ch,
            this.maxScale
        );
        this.scale = Math.max(this.minScale, scale);
        this.tx = (vw - cw * this.scale) / 2;
        this.ty = (vh - ch * this.scale) / 2;
        this.apply();
    }

    zoomBy(factor, cx, cy) {
        if (!this._enabled) return;
        const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
        const rect = this.viewport.getBoundingClientRect();
        const px = (cx == null ? rect.width / 2 : cx - rect.left);
        const py = (cy == null ? rect.height / 2 : cy - rect.top);
        const ratio = newScale / this.scale;
        this.tx = px - (px - this.tx) * ratio;
        this.ty = py - (py - this.ty) * ratio;
        this.scale = newScale;
        this.apply();
    }

    _onWheel(e) {
        if (!this._enabled) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        this.zoomBy(factor, e.clientX, e.clientY);
    }

    _onMouseDown(e) {
        if (!this._enabled) return;
        if (e.button !== 0) return;
        // Don't capture clicks on toolbar buttons or status overlays.
        if (e.target.closest('.preview-toolbar, .modal-toolbar, .preview-status, button')) return;
        this.isPanning = true;
        this.startX = e.clientX - this.tx;
        this.startY = e.clientY - this.ty;
        this.viewport.classList.add('is-panning');
        e.preventDefault();
    }

    _onMouseMove(e) {
        if (!this.isPanning) return;
        this.tx = e.clientX - this.startX;
        this.ty = e.clientY - this.startY;
        this.apply();
    }

    _onMouseUp() {
        if (!this.isPanning) return;
        this.isPanning = false;
        this.viewport.classList.remove('is-panning');
    }
}

// ===================================================================
// DIAGRAM RENDERING FUNCTIONS
// ===================================================================

// Encode PlantUML script for URL-based rendering
function encodePlantUML(s) {
    // Compress the PlantUML script using pako (zlib compression)
    const deflated = pako.deflate(s, { level: 9 });
    let encoded = '';

    // Custom base64-like encoding for PlantUML
    const b64_map = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

    // Process in 3-byte chunks
    for (let i = 0; i < deflated.length; i += 3) {
        const b1 = deflated[i];
        const b2 = i + 1 < deflated.length ? deflated[i + 1] : 0;
        const b3 = i + 2 < deflated.length ? deflated[i + 2] : 0;

        // Convert to 4 characters using custom encoding
        encoded += b64_map.charAt(b1 >> 2);
        encoded += b64_map.charAt(((b1 & 0x03) << 4) | (b2 >> 4));
        encoded += b64_map.charAt(((b2 & 0x0F) << 2) | (b3 >> 6));
        encoded += b64_map.charAt(b3 & 0x3F);
    }

    return encoded;
}

// Render PlantUML diagram using the online service.
// `state` is a per-tab state object holding the latest source/render result.
async function renderPlantUML(pumlCode, state) {
    setStatus(state, 'Rendering...');
    state.lastSource = pumlCode;
    state.svgEl = null;
    state.svgText = '';

    try {
        const encoded = encodePlantUML(pumlCode);
        const url = `https://www.plantuml.com/plantuml/svg/~1${encoded}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const svgText = await response.text();
        if (svgText.includes('Syntax Error?')) {
            setStatus(state, 'PlantUML syntax error — check the script.', true);
            return;
        }

        mountSVG(state, svgText);
    } catch (error) {
        setStatus(state, `Error: ${error.message}`, true);
    }
}

// Render Mermaid diagram using mermaid.js library
async function renderMermaid(mermaidCode, state) {
    setStatus(state, 'Rendering...');
    state.lastSource = mermaidCode;
    state.svgEl = null;
    state.svgText = '';

    try {
        const { svg } = await mermaid.render('mermaid-graph-' + Date.now(), mermaidCode);
        mountSVG(state, svg);
    } catch (error) {
        setStatus(state, `Error: ${error.message}`, true);
    }
}

// Replace the preview content with new SVG markup, then fit-to-view.
function mountSVG(state, svgText) {
    const content = state.viewport.querySelector('.preview-content');
    content.innerHTML = svgText;
    const svg = content.querySelector('svg');
    if (svg) {
        // Strip width/height so we can size with our own transform; keep viewBox.
        if (svg.hasAttribute('width')) svg.removeAttribute('width');
        if (svg.hasAttribute('height')) svg.removeAttribute('height');
        // Give a sensible base width if no viewBox is set, otherwise scale from viewBox.
        const vb = svg.getAttribute('viewBox');
        if (vb) {
            const parts = vb.split(/\s+/).map(Number);
            if (parts.length === 4) {
                svg.style.width = parts[2] + 'px';
                svg.style.height = parts[3] + 'px';
            }
        } else {
            svg.style.width = '800px';
            svg.style.height = 'auto';
        }
        state.svgEl = svg;
        state.svgText = svgText;
    }

    clearStatus(state);
    state.panZoom.setEnabled(true);
    updateDownloadButton(state, true);
    // Defer fit until layout settles.
    requestAnimationFrame(() => state.panZoom.fit());
}

function setStatus(state, msg, isError = false) {
    const status = state.viewport.querySelector('.preview-status');
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('error', isError);
    status.style.display = '';
    state.panZoom.setEnabled(false);
    updateDownloadButton(state, false);
}

function clearStatus(state) {
    const status = state.viewport.querySelector('.preview-status');
    if (status) status.style.display = 'none';
}

function updateDownloadButton(state, enabled) {
    const exportButtons = [
        ['download-png', 'Download as PNG'],
        ['download-svg', 'Download as SVG'],
        ['copy-image', 'Copy image to clipboard'],
    ];
    for (const [action, title] of exportButtons) {
        const btn = state.tab.querySelector(`[data-action="${action}"]`);
        if (btn) {
            btn.disabled = !enabled;
            btn.title = enabled ? title : 'Generate a diagram first';
        }
    }
    const popoutBtn = state.tab.querySelector('[data-action="popout"]');
    if (popoutBtn) popoutBtn.disabled = !enabled;
}

// ===================================================================
// PNG EXPORT
// ===================================================================

function slugify(s) {
    return (s || 'diagram')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'diagram';
}

function buildFilename(kind, title, ext = 'png') {
    const ts = new Date().toISOString().slice(0, 10);
    return `${slugify(title)}-${kind}-${ts}.${ext}`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// PlantUML / C4: ask the PlantUML server for a PNG directly.
async function downloadPlantUMLPng(state) {
    if (!state.lastSource) return;
    const encoded = encodePlantUML(state.lastSource);
    const url = `https://www.plantuml.com/plantuml/png/~1${encoded}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const blob = await response.blob();
        downloadBlob(blob, buildFilename(state.kind, currentTitle(), 'png'));
    } catch (e) {
        showToast(`Failed to download PNG: ${e.message}`, true);
    }
}

// Rasterize the rendered SVG to a PNG blob.
async function svgToPngBlob(state, scale = 2) {
    if (!state.svgEl) return null;
    const svg = state.svgEl.cloneNode(true);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!svg.getAttribute('xmlns:xlink')) {
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }

    // Determine dimensions from the live element.
    const rect = state.svgEl.getBoundingClientRect();
    let w = rect.width, h = rect.height;
    const vb = state.svgEl.getAttribute('viewBox');
    if ((!w || !h) && vb) {
        const parts = vb.split(/\s+/).map(Number);
        if (parts.length === 4) { w = parts[2]; h = parts[3]; }
    }
    if (!w || !h) { w = 1200; h = 800; }
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);

    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Could not load SVG image'));
        img.src = svg64;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(w * scale));
    canvas.height = Math.max(1, Math.floor(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas did not produce a PNG blob'));
        }, 'image/png');
    });
}

// Mermaid: rasterize the rendered SVG to a canvas and download.
async function downloadSvgAsPng(state, scale = 2) {
    if (!state.svgEl) return;
    try {
        const blob = await svgToPngBlob(state, scale);
        if (blob) downloadBlob(blob, buildFilename(state.kind, currentTitle(), 'png'));
    } catch (e) {
        showToast(`Failed to download PNG: ${e.message}`, true);
    }
}

// Save the rendered SVG markup as a file. For PlantUML/C4 this is the
// markup we already fetched from the server; for Mermaid it's whatever
// mermaid.js rendered into the preview.
function downloadSvg(state) {
    if (!state.svgEl) return;
    try {
        let xml = state.svgText;
        if (!xml) {
            const svg = state.svgEl.cloneNode(true);
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            if (!svg.getAttribute('xmlns:xlink')) {
                svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
            }
            xml = new XMLSerializer().serializeToString(svg);
        }
        if (!xml.startsWith('<?xml')) {
            xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
        }
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(blob, buildFilename(state.kind, currentTitle(), 'svg'));
    } catch (e) {
        showToast(`Failed to download SVG: ${e.message}`, true);
    }
}

// Copy the diagram as a PNG image to the system clipboard.
async function copyImageToClipboard(state) {
    if (!state.svgEl) return;
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined' ||
        typeof navigator.clipboard.write !== 'function') {
        showToast('Clipboard image copy is not supported in this browser', true);
        return;
    }
    try {
        const blob = await svgToPngBlob(state, 2);
        if (!blob) throw new Error('Could not generate image');
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]);
        showToast('Image copied to clipboard');
    } catch (e) {
        showToast(`Failed to copy image: ${e.message}`, true);
    }
}

// ===================================================================
// TOAST NOTIFICATIONS
// ===================================================================

const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle('error', !!isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
    }, 2200);
}

function currentTitle() {
    try {
        const data = JSON.parse(jsonInput.value);
        return data && data.title ? data.title : 'diagram';
    } catch (_) {
        return 'diagram';
    }
}

// ===================================================================
// PER-TAB STATE & WIRING
// ===================================================================

// Set up a state object for each tab and wire up its toolbar.
function createTabState(kind) {
    const tab = document.querySelector(`.tab-content[data-kind="${kind}"]`);
    const viewport = tab.querySelector('.preview-box');
    const panZoom = new PanZoom(viewport);
    panZoom.setEnabled(false);
    const state = { kind, tab, viewport, panZoom, lastSource: '', svgEl: null };

    // Toolbar buttons
    tab.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleAction(state, btn.dataset.action));
    });

    // Disable export/popout actions until a diagram is rendered.
    updateDownloadButton(state, false);

    // Drawer toggle
    const drawer = tab.querySelector('.script-drawer');
    const toggle = tab.querySelector('.drawer-toggle');
    if (toggle && drawer) {
        const updateLabel = () => {
            const label = toggle.querySelector('.chev').outerHTML;
            const isCollapsed = drawer.classList.contains('collapsed');
            toggle.innerHTML = `${label}${isCollapsed ? 'Show Script' : 'Hide Script'}`;
        };
        updateLabel();
        toggle.addEventListener('click', () => {
            drawer.classList.toggle('collapsed');
            updateLabel();
            // Re-fit after layout reflows.
            requestAnimationFrame(() => {
                if (state.svgEl) state.panZoom.fit();
            });
        });
    }

    return state;
}

function handleAction(state, action) {
    switch (action) {
        case 'zoom-in': state.panZoom.zoomBy(1.2); break;
        case 'zoom-out': state.panZoom.zoomBy(1 / 1.2); break;
        case 'zoom-reset': state.panZoom.reset(); break;
        case 'zoom-fit': state.panZoom.fit(); break;
        case 'download-png':
            if (state.kind === 'mermaid') downloadSvgAsPng(state);
            else downloadPlantUMLPng(state);
            break;
        case 'download-svg': downloadSvg(state); break;
        case 'copy-image': copyImageToClipboard(state); break;
        case 'popout': openModal(state); break;
    }
}

const tabStates = {
    puml: createTabState('puml'),
    c4: createTabState('c4'),
    mermaid: createTabState('mermaid'),
};

// ===================================================================
// MAIN APPLICATION LOGIC & EVENT HANDLERS
// ===================================================================

// Main function called when Generate button is clicked
function handleGenerateClick() {
    const jsonText = jsonInput.value;
    let data;

    try {
        data = JSON.parse(jsonText);
    } catch (e) {
        jsonStatus.className = 'invalid';
        jsonStatus.textContent = `Invalid JSON: ${e.message}`;
        return;
    }

    if (!validate(data)) {
        jsonStatus.className = 'invalid';
        jsonStatus.textContent = `Schema Error: ${ajv.errorsText(validate.errors)}`;
        return;
    }

    jsonStatus.className = 'valid';
    jsonStatus.textContent = 'JSON is valid! Generating...';

    const generator = new DiagramGenerator(data);

    if (cbPuml.checked) {
        const pumlCode = generator.generatePlantUML();
        pumlOutput.value = pumlCode;
        renderPlantUML(pumlCode, tabStates.puml);
    }

    if (cbC4.checked) {
        const c4Code = generator.generateC4PlantUML();
        c4Output.value = c4Code;
        renderPlantUML(c4Code, tabStates.c4);
    }

    if (cbMermaid.checked) {
        const mermaidCode = generator.generateMermaid();
        mermaidOutput.value = mermaidCode;
        renderMermaid(mermaidCode, tabStates.mermaid);
    }

    jsonStatus.textContent = 'JSON is valid! Diagrams generated.';
}

// ===================================================================
// EVENT LISTENERS SETUP
// ===================================================================

generateBtn.addEventListener('click', handleGenerateClick);

// Live preview updates when scripts are manually edited
pumlOutput.addEventListener('input', () => renderPlantUML(pumlOutput.value, tabStates.puml));
c4Output.addEventListener('input', () => renderPlantUML(c4Output.value, tabStates.c4));
mermaidOutput.addEventListener('input', () => renderMermaid(mermaidOutput.value, tabStates.mermaid));

// Tab switching
const tabs = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const kind = tab.dataset.tab;
        document.getElementById('tab-' + kind).classList.add('active');
        // Re-fit after the previously hidden tab becomes visible.
        requestAnimationFrame(() => {
            const state = tabStates[kind];
            if (state && state.svgEl) state.panZoom.fit();
        });
    });
});

// Re-fit visible diagrams on window resize so they don't end up clipped.
let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        Object.values(tabStates).forEach(state => {
            if (state.svgEl && state.tab.classList.contains('active')) {
                state.panZoom.fit();
            }
        });
    }, 150);
});

// ===================================================================
// MODAL / POP-OUT
// ===================================================================

const modalEl = document.getElementById('imageModal');
const modalTitleEl = document.getElementById('modal-title');
const modalPreview = document.getElementById('modal-preview');
const modalPanZoom = new PanZoom(modalPreview);
modalPanZoom.setEnabled(false);
let modalState = null; // points at the source tab state for downloads

function openModal(state) {
    if (!state.svgEl) return;
    modalTitleEl.textContent = `${state.kind.toUpperCase()} — ${currentTitle()}`;
    const content = modalPreview.querySelector('.preview-content');
    // Clone the rendered SVG so modal pan/zoom is independent of the inline view.
    content.innerHTML = '';
    const clone = state.svgEl.cloneNode(true);
    content.appendChild(clone);
    modalState = state;
    modalEl.classList.add('open');
    modalPanZoom.setEnabled(true);
    requestAnimationFrame(() => modalPanZoom.fit());
}

function closeModal() {
    modalEl.classList.remove('open');
    const content = modalPreview.querySelector('.preview-content');
    content.innerHTML = '';
    modalState = null;
    modalPanZoom.setEnabled(false);
}

document.getElementById('close-modal-btn').addEventListener('click', closeModal);

modalEl.querySelectorAll('[data-modal-action]').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.modalAction;
        switch (action) {
            case 'zoom-in': modalPanZoom.zoomBy(1.2); break;
            case 'zoom-out': modalPanZoom.zoomBy(1 / 1.2); break;
            case 'zoom-reset': modalPanZoom.reset(); break;
            case 'zoom-fit': modalPanZoom.fit(); break;
            case 'download-png':
                if (!modalState) return;
                if (modalState.kind === 'mermaid') downloadSvgAsPng(modalState);
                else downloadPlantUMLPng(modalState);
                break;
            case 'download-svg':
                if (!modalState) return;
                downloadSvg(modalState);
                break;
            case 'copy-image':
                if (!modalState) return;
                copyImageToClipboard(modalState);
                break;
        }
    });
});

// Close modal when clicking the dim background
modalEl.addEventListener('click', (event) => {
    if (event.target === modalEl) closeModal();
});

// Close modal with Escape key
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
});

// ===================================================================
// APPLICATION INITIALIZATION
// ===================================================================

// Load sample JSON and generate initial diagrams when page loads
jsonInput.value = JSON.stringify(sampleJson, null, 2);
handleGenerateClick();
