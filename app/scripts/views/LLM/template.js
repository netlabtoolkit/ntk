<div class="widgetAuthoring">
    <div class="widgetTop typeAI">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <select class="modeSelect" rv-value="widget:mode">
            <option value="answer">Answer</option>
            <option value="rewrite">Rewrite</option>
            <option value="summarize">Summarize</option>
        </select>
        <div class="sendButton" rv-class-calling="widget:calling">send</div>
        <div class="llmStatus" rv-text="widget:status"></div>
        <div class="llmPreview" rv-text="widget:preview"></div>
        <div class="llmError" rv-show="widget:statusText" rv-text="widget:statusText"></div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content llmMore">
            <label>provider</label>
            <select class="providerSelect" rv-value="widget:provider">
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama (local)</option>
            </select>

            <label>model</label>
            <select class="modelSelect"></select>
            <input class="modelInput" type="text" placeholder="or type a model id">
            <div class="llmKey">
                <span rv-text="widget:keyText"></span><br>
                <button class="setupKey" type="button">set up key</button>
                <button class="refreshModels" type="button">refresh models</button>
            </div>

            <hr>
            <label class="wide-label">personality traits</label>
            <input type="text" rv-value="widget:traits" placeholder="e.g. professional, scientific">
            <label class="wide-label">format / purpose</label>
            <input type="text" rv-value="widget:format" placeholder="e.g. email, essay, bulleted notes">
            <label class="wide-label">audience</label>
            <input type="text" rv-value="widget:audience" placeholder="e.g. executive, engineer, general reader">
            <label class="wide-label">response length (words, or % for rewrite)</label>
            <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:length">
            <label class="wide-label">temperature (0&ndash;1)</label>
            <input class="moreParam" type="text" rv-value="widget:temperature">

            <hr>
            <label class="checkRow"><input type="checkbox" rv-checked="widget:autoSend" /> auto-send when the prompt changes</label>
            <label class="wide-label">max tokens</label>
            <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:maxTokens">
            <label class="wide-label">base URL (optional)</label>
            <input type="text" rv-value="widget:baseURL" placeholder="provider default">
            <label class="wide-label">extra system instructions</label>
            <textarea class="database" rv-value="widget:systemAppend" rows="2"></textarea>

            <hr>
            <label class="wide-label">assembled system prompt</label>
            <div class="assembledSystem" rv-text="widget:assembledSystem"></div>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/llm/" target="_blank">Widget help</a>
        </div>
    </div>
</div>
