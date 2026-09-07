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
            <option value="argue">Argue with</option>
        </select>
        <div class="llmPrompt" rv-text="widget:in"></div>
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

            <div class="f wide">
                <label>prompt / text</label>
                <textarea class="promptInput database" rv-value="widget:in" rows="3" placeholder="Type a question or text, or wire something into the 'prompt' inlet."></textarea>
            </div>

            <div class="f">
                <label>provider</label>
                <select class="providerSelect" rv-value="widget:provider">
                    <option value="ollama">Ollama (local)</option>
                    <option value="anthropic">Anthropic</option>
                </select>
            </div>
            <div class="f">
                <label>model</label>
                <select class="modelSelect"></select>
            </div>
            <div class="f wide">
                <div class="llmKey">
                    <span rv-text="widget:keyText"></span>
                    <button class="setupKey" type="button">set up key</button>
                    <button class="refreshModels" type="button">refresh models</button>
                </div>
            </div>

            <hr>

            <div class="f wide personalityButtons">
                <label>personality</label>
                <button class="randomPersonality" type="button">random</button>
                <button class="resetPersonality" type="button">reset</button>
            </div>

            <div class="traitRow">
                <select class="traitSelect" data-slot="1"></select>
                <input class="traitCustom" data-slot="1" type="text" placeholder="your own" rv-value="widget:trait1Custom">
            </div>
            <div class="traitRow">
                <select class="traitSelect" data-slot="2"></select>
                <input class="traitCustom" data-slot="2" type="text" placeholder="your own" rv-value="widget:trait2Custom">
            </div>
            <div class="traitRow">
                <select class="traitSelect" data-slot="3"></select>
                <input class="traitCustom" data-slot="3" type="text" placeholder="your own" rv-value="widget:trait3Custom">
            </div>
            <div class="traitRow">
                <select class="traitSelect" data-slot="4"></select>
                <input class="traitCustom" data-slot="4" type="text" placeholder="your own" rv-value="widget:trait4Custom">
            </div>

            <div class="f">
                <label>purpose</label>
                <div class="choiceRow">
                    <select class="choiceSelect formatSelect" data-field="format"></select>
                    <input class="formatCustom" type="text" placeholder="your own" rv-value="widget:formatCustom">
                </div>
            </div>
            <div class="f">
                <label>audience</label>
                <div class="choiceRow">
                    <select class="choiceSelect audienceSelect" data-field="audience"></select>
                    <input class="audienceCustom" type="text" placeholder="your own" rv-value="widget:audienceCustom">
                </div>
            </div>

            <div class="f wide inlineField">
                <label>length&nbsp;<span class="hint">(words, or % for rewrite)</span></label>
                <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:length">
            </div>
            <div class="f wide inlineField">
                <label>temperature&nbsp;<span class="tempVal" rv-text="widget:temperature"></span></label>
                <input class="tempSlider" type="range" min="0" max="2" step="0.1">
            </div>

            <div class="f">
                <label class="checkRow"><input type="checkbox" rv-checked="widget:markdown" /> Markdown response</label>
            </div>
            <div class="f">
                <label class="checkRow"><input type="checkbox" rv-checked="widget:autoSend" /> auto-send on new prompt</label>
            </div>

            <hr>

            <div class="f">
                <label>max tokens</label>
                <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:maxTokens">
            </div>
            <div class="f">
                <label>base URL</label>
                <input type="text" rv-value="widget:baseURL" placeholder="provider default">
            </div>

            <div class="f wide">
                <label>extra instructions</label>
                <textarea class="database" rv-value="widget:systemAppend" rows="2"></textarea>
            </div>
            <div class="f wide">
                <label>system prompt (assembled)</label>
                <div class="assembledSystem" rv-text="widget:assembledSystem"></div>
            </div>

            <hr>
            <a class="widgetHelpLink wide" href="https://www.netlabtoolkit.org/documentation/widgets-old/llm/" target="_blank">Widget help</a>
        </div>
    </div>
</div>
