document.addEventListener('DOMContentLoaded', () => {
    const calldataInput = document.getElementById('calldata-input');
    const decodeBtn = document.getElementById('decode-btn');
    const clearBtn = document.getElementById('clear-btn');
    const placeholder = document.getElementById('placeholder');
    const result = document.getElementById('result');
    const error = document.getElementById('error');
    const loading = document.getElementById('loading');
    const selectorBadge = document.getElementById('selector-badge');
    const signaturesList = document.getElementById('signatures-list');
    const paramsTable = document.getElementById('params-table');
    const paramsCard = document.getElementById('params-card');

    let currentCalldata = '';
    let currentSignatures = [];
    let decodedModel = null;      // Stores decoded structure for re-encoding
    let currentTypes = [];        // Parameter types from signature
    let currentSelector = '';     // 4-byte function selector

    decodeBtn.addEventListener('click', decode);
    clearBtn.addEventListener('click', clear);
    calldataInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            decode();
        }
    });

    function showState(state) {
        placeholder.style.display = state === 'placeholder' ? 'flex' : 'none';
        result.style.display = state === 'result' ? 'block' : 'none';
        error.style.display = state === 'error' ? 'block' : 'none';
        loading.style.display = state === 'loading' ? 'flex' : 'none';
    }

    function showError(message) {
        document.getElementById('error-message').textContent = message;
        showState('error');
    }

    function clear() {
        calldataInput.value = '';
        currentCalldata = '';
        currentSignatures = [];
        decodedModel = null;
        currentTypes = [];
        currentSelector = '';
        showState('placeholder');
    }

    async function decode() {
        const input = calldataInput.value.trim();

        if (!input) {
            showError('Please enter calldata to decode');
            return;
        }

        // Normalize input
        let calldata = input;
        if (!calldata.startsWith('0x')) {
            calldata = '0x' + calldata;
        }

        // Validate hex
        if (!/^0x[0-9a-fA-F]*$/.test(calldata)) {
            showError('Invalid calldata: must be a valid hex string');
            return;
        }

        if (calldata.length < 10) {
            showError('Calldata too short: must have at least 4 bytes for function selector');
            return;
        }

        currentCalldata = calldata;
        const selector = calldata.slice(0, 10).toLowerCase();

        showState('loading');

        try {
            const signatures = await fetchSignatures(selector);
            currentSignatures = signatures;

            if (signatures.length === 0) {
                showError(`No matching function signatures found for selector ${selector}`);
                return;
            }

            displayResult(selector, signatures, calldata);
        } catch (err) {
            showError(`Failed to fetch signatures: ${err.message}`);
        }
    }

    async function fetchSignatures(selector) {
        const response = await fetch(
            `https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}`
        );

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        return data.results.map(r => r.text_signature).sort((a, b) => a.length - b.length);
    }

    function displayResult(selector, signatures, calldata) {
        showState('result');

        selectorBadge.textContent = selector;

        // Display signatures
        signaturesList.innerHTML = '';
        signatures.forEach((sig, index) => {
            const item = document.createElement('div');
            item.className = 'signature-item' + (index === 0 ? ' selected' : '');

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'signature';
            radio.id = `sig-${index}`;
            radio.checked = index === 0;
            radio.addEventListener('change', () => {
                document.querySelectorAll('.signature-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                displayParams(sig, calldata);
            });

            const label = document.createElement('label');
            label.htmlFor = `sig-${index}`;
            label.className = 'signature-text';
            label.innerHTML = formatSignature(sig);

            item.appendChild(radio);
            item.appendChild(label);
            item.addEventListener('click', () => radio.click());
            signaturesList.appendChild(item);
        });

        // Display params for first signature
        displayParams(signatures[0], calldata);
    }

    function formatSignature(sig) {
        const match = sig.match(/^(\w+)\((.*)\)$/);
        if (!match) return escapeHtml(sig);

        const name = match[1];
        const params = match[2];

        return `<span class="function-name">${escapeHtml(name)}</span>(<span class="param-type">${escapeHtml(params)}</span>)`;
    }

    function displayParams(signature, calldata) {
        const params = parseSignature(signature);
        const data = calldata.slice(10); // Remove selector

        // Store for re-encoding
        currentTypes = params;
        currentSelector = calldata.slice(0, 10);

        paramsTable.innerHTML = '';

        if (params.length === 0) {
            paramsTable.innerHTML = '<p class="no-params">No parameters</p>';
            decodedModel = [];
            return;
        }

        try {
            const decoded = decodeParams(params, data);

            // Store the decoded model for re-encoding
            decodedModel = decoded;

            decoded.forEach((param, index) => {
                const row = document.createElement('div');
                row.className = 'param-row';

                const indexEl = document.createElement('span');
                indexEl.className = 'param-index';
                indexEl.textContent = `#${index}`;

                const details = document.createElement('div');
                details.className = 'param-details';

                const typeLabel = document.createElement('span');
                typeLabel.className = 'param-type-label';
                typeLabel.textContent = param.type;

                details.appendChild(typeLabel);

                // Render value with path for editing
                const valueContainer = renderValue(param.value, param.type, [index]);
                details.appendChild(valueContainer);

                row.appendChild(indexEl);
                row.appendChild(details);
                paramsTable.appendChild(row);
            });
        } catch (err) {
            paramsTable.innerHTML = `<p class="error-inline">Failed to decode parameters: ${escapeHtml(err.message)}</p>`;
        }
    }

    function renderValue(value, type, path) {
        // Check if value is a complex structure (tuple or array)
        if (value && typeof value === 'object') {
            if (value.isTuple) {
                return renderTuple(value, type, path);
            } else if (value.isArray) {
                return renderArray(value, type, path);
            }
        }

        // Simple value - create editable input
        const container = document.createElement('span');
        container.className = 'param-value editable';

        if (type === 'address') {
            container.classList.add('address');
        } else if (type && (type.startsWith('uint') || type.startsWith('int'))) {
            container.classList.add('number');
        } else if (type === 'bool') {
            container.classList.add('bool');
        } else if (type === 'string') {
            container.classList.add('string');
        } else if (type && type.startsWith('bytes')) {
            container.classList.add('bytes');
        }

        const textarea = document.createElement('textarea');
        textarea.className = 'value-input';
        textarea.value = value;
        textarea.dataset.path = JSON.stringify(path);
        textarea.dataset.type = type;
        textarea.rows = 1;

        // Auto-size textarea height based on content
        const resizeTextarea = () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        };
        // Use setTimeout to ensure DOM is ready
        setTimeout(resizeTextarea, 0);
        textarea.addEventListener('input', () => {
            resizeTextarea();
            handleValueEdit({ target: textarea });
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Reset to original value from model
                const currentValue = getValueAtPath(decodedModel, path);
                textarea.value = currentValue;
                resizeTextarea();
                textarea.blur();
            }
        });

        container.appendChild(textarea);
        return container;
    }

    function renderTuple(tupleValue, type, path) {
        const container = document.createElement('div');
        container.className = 'tuple-container expanded';

        const header = document.createElement('div');
        header.className = 'collapsible-header';
        header.innerHTML = `
            <span class="collapse-toggle">
                <span class="chevron"></span>
            </span>
            <span class="tuple-bracket">{</span>
            <span class="collapse-preview">${tupleValue.fields.length} fields</span>
        `;
        header.addEventListener('click', () => toggleCollapse(container));
        container.appendChild(header);

        const fields = document.createElement('div');
        fields.className = 'tuple-fields collapsible-content';

        tupleValue.fields.forEach((field, index) => {
            const fieldRow = document.createElement('div');
            fieldRow.className = 'tuple-field';

            const fieldIndex = document.createElement('span');
            fieldIndex.className = 'tuple-field-index';
            fieldIndex.textContent = `[${index}]`;

            const fieldType = document.createElement('span');
            fieldType.className = 'tuple-field-type';
            fieldType.textContent = field.type;

            // Pass nested path
            const fieldPath = [...path, 'fields', index];
            const fieldValue = renderValue(field.value, field.type, fieldPath);

            fieldRow.appendChild(fieldIndex);
            fieldRow.appendChild(fieldType);
            fieldRow.appendChild(fieldValue);
            fields.appendChild(fieldRow);
        });

        container.appendChild(fields);

        const footer = document.createElement('div');
        footer.className = 'tuple-footer collapsible-footer';
        footer.innerHTML = '<span class="tuple-bracket">}</span>';
        container.appendChild(footer);

        return container;
    }

    function renderArray(arrayValue, type, path) {
        const container = document.createElement('div');
        container.className = 'array-container expanded';

        const header = document.createElement('div');
        header.className = 'collapsible-header';
        header.innerHTML = `
            <span class="collapse-toggle">
                <span class="chevron"></span>
            </span>
            <span class="array-bracket">[</span>
            <span class="collapse-preview">${arrayValue.items.length} items</span>
        `;
        header.addEventListener('click', () => toggleCollapse(container));
        container.appendChild(header);

        if (arrayValue.items.length > 0) {
            const items = document.createElement('div');
            items.className = 'array-items collapsible-content';

            arrayValue.items.forEach((item, index) => {
                const itemRow = document.createElement('div');
                itemRow.className = 'array-item';

                const itemIndex = document.createElement('span');
                itemIndex.className = 'array-item-index';
                itemIndex.textContent = `[${index}]`;

                // Pass nested path
                const itemPath = [...path, 'items', index];
                const itemValue = renderValue(item.value, item.type, itemPath);

                itemRow.appendChild(itemIndex);
                itemRow.appendChild(itemValue);
                items.appendChild(itemRow);
            });

            container.appendChild(items);
        }

        const footer = document.createElement('div');
        footer.className = 'array-footer collapsible-footer';
        footer.innerHTML = '<span class="array-bracket">]</span>';
        container.appendChild(footer);

        return container;
    }

    function toggleCollapse(container) {
        container.classList.toggle('expanded');
        container.classList.toggle('collapsed');
    }

    function parseSignature(sig) {
        const match = sig.match(/^\w+\((.*)\)$/);
        if (!match) return [];

        const paramsStr = match[1];
        if (!paramsStr) return [];

        // Handle nested tuples and arrays
        const params = [];
        let depth = 0;
        let current = '';

        for (const char of paramsStr) {
            if (char === '(' || char === '[') {
                depth++;
                current += char;
            } else if (char === ')' || char === ']') {
                depth--;
                current += char;
            } else if (char === ',' && depth === 0) {
                if (current.trim()) {
                    params.push(current.trim());
                }
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            params.push(current.trim());
        }

        return params;
    }

    // Check if a type is dynamic (requires offset pointer in ABI encoding)
    function isDynamicType(type) {
        // Dynamic bytes or string
        if (type === 'bytes' || type === 'string') {
            return true;
        }

        // Dynamic array (no size specified)
        const arrayMatch = type.match(/^(.+)\[(\d*)\]$/);
        if (arrayMatch) {
            const size = arrayMatch[2];
            if (!size) {
                return true; // Dynamic array
            }
            // Fixed-size array is dynamic if base type is dynamic
            return isDynamicType(arrayMatch[1]);
        }

        // Tuple - dynamic if any element is dynamic
        if (type.startsWith('(') && type.endsWith(')')) {
            const innerTypes = parseSignature(`f${type}`);
            return innerTypes.some(t => isDynamicType(t));
        }

        return false;
    }

    function decodeParams(types, data) {
        const results = [];
        let headOffset = 0;

        for (const type of types) {
            if (isDynamicType(type)) {
                // Read offset pointer from head, decode from that location
                const dataOffset = parseInt(data.slice(headOffset, headOffset + 64), 16) * 2;
                const decoded = decodeParam(type, data, dataOffset, 0);
                results.push({ type, value: decoded.value });
                headOffset += 64;
            } else {
                // Static type - decode in place
                const decoded = decodeParam(type, data, headOffset, 0);
                results.push({ type, value: decoded.value });
                headOffset += decoded.headSize;
            }
        }

        return results;
    }

    // baseOffset is used for relative offset calculations within dynamic types
    function decodeParam(type, data, offset, baseOffset) {
        // Handle arrays
        const arrayMatch = type.match(/^(.+)\[(\d*)\]$/);
        if (arrayMatch) {
            const baseType = arrayMatch[1];
            const size = arrayMatch[2] ? parseInt(arrayMatch[2]) : null;

            if (size !== null) {
                // Fixed-size array
                if (isDynamicType(baseType)) {
                    // Fixed array of dynamic types
                    const items = [];
                    let headPos = offset;
                    for (let i = 0; i < size; i++) {
                        const elemOffset = parseInt(data.slice(headPos, headPos + 64), 16) * 2;
                        const decoded = decodeParam(baseType, data, offset + elemOffset, offset);
                        items.push({ type: baseType, value: decoded.value });
                        headPos += 64;
                    }
                    return { value: { isArray: true, items }, headSize: size * 64 };
                } else {
                    // Fixed array of static types
                    const items = [];
                    let pos = offset;
                    for (let i = 0; i < size; i++) {
                        const decoded = decodeParam(baseType, data, pos, baseOffset);
                        items.push({ type: baseType, value: decoded.value });
                        pos += decoded.headSize;
                    }
                    return { value: { isArray: true, items }, headSize: size * 64 };
                }
            } else {
                // Dynamic array - length is at offset, then elements follow
                const length = parseInt(data.slice(offset, offset + 64), 16);
                const items = [];

                if (isDynamicType(baseType)) {
                    // Dynamic array of dynamic types
                    const elemHeadStart = offset + 64;
                    for (let i = 0; i < length; i++) {
                        const elemOffset = parseInt(data.slice(elemHeadStart + i * 64, elemHeadStart + i * 64 + 64), 16) * 2;
                        const decoded = decodeParam(baseType, data, elemHeadStart + elemOffset, elemHeadStart);
                        items.push({ type: baseType, value: decoded.value });
                    }
                } else {
                    // Dynamic array of static types
                    let pos = offset + 64;
                    for (let i = 0; i < length; i++) {
                        const decoded = decodeParam(baseType, data, pos, baseOffset);
                        items.push({ type: baseType, value: decoded.value });
                        pos += decoded.headSize;
                    }
                }

                return { value: { isArray: true, items }, headSize: 64 };
            }
        }

        // Handle tuples
        if (type.startsWith('(') && type.endsWith(')')) {
            const innerTypes = parseSignature(`f${type}`);
            const fields = [];
            let headPos = offset;
            const tupleBase = offset; // Base for relative offsets within this tuple

            for (const innerType of innerTypes) {
                if (isDynamicType(innerType)) {
                    // Dynamic field - read offset, decode from there
                    const fieldOffset = parseInt(data.slice(headPos, headPos + 64), 16) * 2;
                    const decoded = decodeParam(innerType, data, tupleBase + fieldOffset, tupleBase);
                    fields.push({ type: innerType, value: decoded.value });
                    headPos += 64;
                } else {
                    // Static field - decode in place
                    const decoded = decodeParam(innerType, data, headPos, tupleBase);
                    fields.push({ type: innerType, value: decoded.value });
                    headPos += decoded.headSize;
                }
            }

            const headSize = innerTypes.reduce((sum, t) => sum + (isDynamicType(t) ? 64 : getStaticSize(t)), 0);
            return { value: { isTuple: true, fields }, headSize };
        }

        // Basic types
        const word = data.slice(offset, offset + 64);

        if (type === 'address') {
            return { value: '0x' + word.slice(24), headSize: 64 };
        }

        if (type === 'bool') {
            const val = parseInt(word, 16);
            return { value: val ? 'true' : 'false', headSize: 64 };
        }

        if (type.startsWith('uint')) {
            const val = BigInt('0x' + word);
            return { value: val.toString(), headSize: 64 };
        }

        if (type.startsWith('int')) {
            // Handle signed integers
            let val = BigInt('0x' + word);
            const bits = parseInt(type.slice(3)) || 256;
            const maxPositive = BigInt(2) ** BigInt(bits - 1);
            if (val >= maxPositive) {
                val = val - BigInt(2) ** BigInt(bits);
            }
            return { value: val.toString(), headSize: 64 };
        }

        if (type.startsWith('bytes')) {
            const size = type.slice(5);
            if (size) {
                // Fixed-size bytes
                const byteSize = parseInt(size);
                return { value: '0x' + word.slice(0, byteSize * 2), headSize: 64 };
            } else {
                // Dynamic bytes - we're already at the data location
                const length = parseInt(data.slice(offset, offset + 64), 16);
                const value = data.slice(offset + 64, offset + 64 + length * 2);
                return { value: '0x' + value, headSize: 64 };
            }
        }

        if (type === 'string') {
            // We're already at the data location
            const length = parseInt(data.slice(offset, offset + 64), 16);
            const hexStr = data.slice(offset + 64, offset + 64 + length * 2);
            const str = hexToString(hexStr);
            return { value: `"${str}"`, headSize: 64 };
        }

        // Fallback: return raw hex
        return { value: '0x' + word, headSize: 64 };
    }

    // Get the head size (in hex chars) for a static type
    function getStaticSize(type) {
        const arrayMatch = type.match(/^(.+)\[(\d+)\]$/);
        if (arrayMatch) {
            const size = parseInt(arrayMatch[2]);
            return size * getStaticSize(arrayMatch[1]);
        }

        if (type.startsWith('(') && type.endsWith(')')) {
            const innerTypes = parseSignature(`f${type}`);
            return innerTypes.reduce((sum, t) => sum + getStaticSize(t), 0);
        }

        // All basic static types are 32 bytes = 64 hex chars
        return 64;
    }

    function hexToString(hex) {
        let str = '';
        for (let i = 0; i < hex.length; i += 2) {
            const code = parseInt(hex.slice(i, i + 2), 16);
            if (code === 0) break;
            str += String.fromCharCode(code);
        }
        return str;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============================================
    // EDIT HANDLERS
    // ============================================

    function handleValueEdit(event) {
        const input = event.target;
        const path = JSON.parse(input.dataset.path);
        const type = input.dataset.type;
        const newValue = input.value.trim();

        // Get original value for comparison
        const originalValue = getValueAtPath(decodedModel, path);
        if (newValue === originalValue) {
            return; // No change
        }

        // Validate the new value by attempting to encode it
        try {
            encodeParam(type, newValue);
        } catch (err) {
            showInputError(input, err.message);
            return;
        }

        // Update the model
        updateValueAtPath(decodedModel, path, newValue);

        // Re-encode all parameters
        try {
            const newCalldata = reencodeCalldata();

            // Update textarea and state
            calldataInput.value = newCalldata;
            currentCalldata = newCalldata;

            // Visual feedback
            showInputSuccess(input);
        } catch (err) {
            // Revert the model change
            updateValueAtPath(decodedModel, path, originalValue);
            showInputError(input, err.message);
        }
    }

    function getValueAtPath(model, path) {
        let current = model;

        for (let i = 0; i < path.length; i++) {
            const key = path[i];
            if (typeof key === 'number') {
                current = current[key];
            } else if (key === 'fields') {
                current = current.value.fields;
            } else if (key === 'items') {
                current = current.value.items;
            }
        }

        return current.value !== undefined ? current.value : current;
    }

    function updateValueAtPath(model, path, newValue) {
        let current = model;

        // Navigate to parent
        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];
            if (typeof key === 'number') {
                current = current[key];
            } else if (key === 'fields') {
                current = current.value.fields;
            } else if (key === 'items') {
                current = current.value.items;
            }
        }

        // Update the final value
        const lastKey = path[path.length - 1];
        if (typeof lastKey === 'number') {
            current[lastKey].value = newValue;
        }
    }

    function reencodeCalldata() {
        // Extract values from model for encoding
        const values = decodedModel.map(param => param.value);

        // Encode parameters
        const encodedParams = encodeParams(currentTypes, values);

        // Combine with selector
        return currentSelector + encodedParams;
    }

    function showInputError(input, message) {
        input.classList.add('error');
        input.classList.remove('success');
        input.title = message;

        setTimeout(() => {
            input.classList.remove('error');
            input.title = '';
        }, 3000);
    }

    function showInputSuccess(input) {
        input.classList.add('success');
        input.classList.remove('error');
        input.title = '';

        setTimeout(() => {
            input.classList.remove('success');
        }, 300);
    }

    // ============================================
    // ABI ENCODING FUNCTIONS
    // ============================================

    function encodeParams(types, values) {
        // Calculate total head size first
        let headSize = 0;
        for (const type of types) {
            headSize += isDynamicType(type) ? 32 : getStaticSizeBytes(type);
        }

        // Build heads and tails
        let currentOffset = headSize;
        const heads = [];
        const tails = [];

        for (let i = 0; i < types.length; i++) {
            const type = types[i];
            const value = values[i];

            if (isDynamicType(type)) {
                // Write offset in head, data in tail
                heads.push(encodeUint256(currentOffset));
                const tailData = encodeParam(type, value);
                tails.push(tailData);
                currentOffset += tailData.length / 2; // hex chars to bytes
            } else {
                // Static type goes directly in head
                heads.push(encodeParam(type, value));
            }
        }

        return heads.join('') + tails.join('');
    }

    function encodeParam(type, value) {
        // Handle arrays
        const arrayMatch = type.match(/^(.+)\[(\d*)\]$/);
        if (arrayMatch) {
            return encodeArray(arrayMatch[1], arrayMatch[2], value);
        }

        // Handle tuples
        if (type.startsWith('(') && type.endsWith(')')) {
            return encodeTuple(type, value);
        }

        // Basic types
        if (type === 'address') {
            return encodeAddress(value);
        }

        if (type === 'bool') {
            return encodeBool(value);
        }

        if (type.startsWith('uint')) {
            return encodeUint(type, value);
        }

        if (type.startsWith('int')) {
            return encodeInt(type, value);
        }

        if (type.startsWith('bytes')) {
            const size = type.slice(5);
            if (size) {
                return encodeBytesN(parseInt(size), value);
            } else {
                return encodeDynamicBytes(value);
            }
        }

        if (type === 'string') {
            return encodeString(value);
        }

        throw new Error(`Unsupported type for encoding: ${type}`);
    }

    function encodeAddress(value) {
        const addr = value.toLowerCase().replace('0x', '');
        if (addr.length !== 40) {
            throw new Error(`Invalid address length: ${value}`);
        }
        if (!/^[0-9a-f]+$/i.test(addr)) {
            throw new Error(`Invalid address format: ${value}`);
        }
        return addr.padStart(64, '0');
    }

    function encodeBool(value) {
        const normalized = value.toString().toLowerCase().trim();
        if (normalized === 'true' || normalized === '1') {
            return '0'.repeat(63) + '1';
        } else if (normalized === 'false' || normalized === '0') {
            return '0'.repeat(64);
        }
        throw new Error(`Invalid boolean value: ${value}`);
    }

    function encodeUint(type, value) {
        const bits = parseInt(type.slice(4)) || 256;
        const maxValue = BigInt(2) ** BigInt(bits) - BigInt(1);

        let val;
        try {
            val = BigInt(value);
        } catch {
            throw new Error(`Invalid uint value: ${value}`);
        }

        if (val < 0n) {
            throw new Error(`Uint cannot be negative: ${value}`);
        }
        if (val > maxValue) {
            throw new Error(`Value exceeds uint${bits} max: ${value}`);
        }

        return val.toString(16).padStart(64, '0');
    }

    function encodeInt(type, value) {
        const bits = parseInt(type.slice(3)) || 256;
        const maxPositive = BigInt(2) ** BigInt(bits - 1) - BigInt(1);
        const minNegative = -(BigInt(2) ** BigInt(bits - 1));

        let val;
        try {
            val = BigInt(value);
        } catch {
            throw new Error(`Invalid int value: ${value}`);
        }

        if (val > maxPositive || val < minNegative) {
            throw new Error(`Value out of range for int${bits}: ${value}`);
        }

        // Two's complement for negative numbers
        if (val < 0n) {
            val = BigInt(2) ** BigInt(256) + val;
        }

        return val.toString(16).padStart(64, '0');
    }

    function encodeBytesN(n, value) {
        let hex = value.replace('0x', '');
        if (hex.length !== n * 2) {
            throw new Error(`bytes${n} requires exactly ${n} bytes, got ${hex.length / 2}`);
        }
        if (!/^[0-9a-fA-F]*$/.test(hex)) {
            throw new Error(`Invalid hex in bytes${n}: ${value}`);
        }
        return hex.toLowerCase().padEnd(64, '0');
    }

    function encodeDynamicBytes(value) {
        const hex = value.replace('0x', '');
        if (!/^[0-9a-fA-F]*$/.test(hex)) {
            throw new Error(`Invalid hex in bytes: ${value}`);
        }

        const length = hex.length / 2;
        const paddedLength = Math.ceil(hex.length / 64) * 64 || 64;

        return encodeUint256(length) + hex.toLowerCase().padEnd(paddedLength, '0');
    }

    function encodeString(value) {
        // Remove surrounding quotes if present
        let str = value;
        if (str.startsWith('"') && str.endsWith('"')) {
            str = str.slice(1, -1);
        }

        // Convert string to UTF-8 hex
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        let hex = '';
        for (const byte of bytes) {
            hex += byte.toString(16).padStart(2, '0');
        }

        const length = bytes.length;
        const paddedLength = Math.ceil(hex.length / 64) * 64 || 64;

        return encodeUint256(length) + hex.padEnd(paddedLength, '0');
    }

    function encodeUint256(value) {
        return BigInt(value).toString(16).padStart(64, '0');
    }

    function encodeArray(baseType, sizeStr, value) {
        const items = value.isArray ? value.items : value;
        const isDynamic = !sizeStr; // Empty sizeStr means dynamic array

        let result = '';

        if (isDynamic) {
            // Prepend length for dynamic arrays
            result += encodeUint256(items.length);
        }

        if (isDynamicType(baseType)) {
            // Dynamic elements: offsets in head, data in tail
            const headSize = items.length * 32;
            let currentOffset = headSize;
            const heads = [];
            const tails = [];

            for (const item of items) {
                heads.push(encodeUint256(currentOffset));
                const itemValue = item.value !== undefined ? item.value : item;
                const tailData = encodeParam(baseType, itemValue);
                tails.push(tailData);
                currentOffset += tailData.length / 2;
            }

            result += heads.join('') + tails.join('');
        } else {
            // Static elements: inline
            for (const item of items) {
                const itemValue = item.value !== undefined ? item.value : item;
                result += encodeParam(baseType, itemValue);
            }
        }

        return result;
    }

    function encodeTuple(type, value) {
        const innerTypes = parseSignature(`f${type}`);
        const fields = value.isTuple ? value.fields : value;

        // Calculate head size
        let headSize = 0;
        for (const innerType of innerTypes) {
            headSize += isDynamicType(innerType) ? 32 : getStaticSizeBytes(innerType);
        }

        // Build heads and tails
        let currentOffset = headSize;
        const heads = [];
        const tails = [];

        for (let i = 0; i < innerTypes.length; i++) {
            const innerType = innerTypes[i];
            const fieldValue = fields[i].value !== undefined ? fields[i].value : fields[i];

            if (isDynamicType(innerType)) {
                heads.push(encodeUint256(currentOffset));
                const tailData = encodeParam(innerType, fieldValue);
                tails.push(tailData);
                currentOffset += tailData.length / 2;
            } else {
                heads.push(encodeParam(innerType, fieldValue));
            }
        }

        return heads.join('') + tails.join('');
    }

    function getStaticSizeBytes(type) {
        return getStaticSize(type) / 2; // Convert hex chars to bytes
    }
});
