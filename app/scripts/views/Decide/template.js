<div class="widgetAuthoring">
    <div class="widgetTop typeAI">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <input class="decideText" type="text" data-field="in" rv-value="widget:in" spellcheck="false" placeholder="type to test…" title="The text to decide on: type here to try the questions, or wire text into the inlet (e.g. from SpeechIn)">
        <div class="decideAnswers">
            <div class="decideLine" rv-class-low="widget:low1" rv-class-held="widget:held1" rv-title="widget:tip1"><div class="decideBar" rv-decidebar="widget:conf1"></div><span rv-text="widget:line1"></span></div>
            <div class="decideLine" rv-class-low="widget:low2" rv-class-held="widget:held2" rv-title="widget:tip2"><div class="decideBar" rv-decidebar="widget:conf2"></div><span rv-text="widget:line2"></span></div>
            <div class="decideLine" rv-class-low="widget:low3" rv-class-held="widget:held3" rv-title="widget:tip3"><div class="decideBar" rv-decidebar="widget:conf3"></div><span rv-text="widget:line3"></span></div>
            <div class="decideLine" rv-class-low="widget:low4" rv-class-held="widget:held4" rv-title="widget:tip4"><div class="decideBar" rv-decidebar="widget:conf4"></div><span rv-text="widget:line4"></span></div>
        </div>
        <div class="decideFoot">
            <button type="button" class="decideButton" rv-class-busy="widget:busy" title="Decide on the text now">decide</button>
            <span class="decideStatus" rv-class-error="widget:hasError" rv-text="widget:statusText" rv-title="widget:statusTitle"></span>
        </div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label class="wide-label">questions</label>
            <div class="decideEditor">
                <div class="decideGutter" aria-hidden="true"></div>
                <textarea class="decideScript" rows="9" spellcheck="false" rv-value="widget:script" title="One question per outlet, in order. Takes effect when you click out of the box."></textarea>
            </div>
            <ul class="decideErrors">
                <li rv-each-err="widget:scriptErrors" rv-text="err" title="Click to go to this line"></li>
            </ul>
            <div class="decideHint">
                <code>name: choice a | b | none=desc</code><br>
                <code>name: yes/no The question?</code><br>
                <code>name: score low &lt; mid &lt; high</code><br>
                then the question on an indented line
            </div>
            <hr>
            <label>model</label> <input class="decideModel" type="text" list="" spellcheck="false" rv-value="widget:model" title="An Ollama decision model. tev1:4b is quick and fits a 16 GB Mac; nimble is more accurate but needs about 18 GB of memory; kev:4b-mlx-bf16 is faster but weaker on score questions."><datalist class="decideModelList"></datalist><br>
            <label>address</label> <input class="decideBaseURL" type="text" spellcheck="false" rv-value="widget:baseURL" title="Where Ollama runs - this Mac (http://localhost:11434) or another computer on the network"><br>
            <label>confidence</label> <input class="moreParam" type="text" rv-value="widget:threshold" title="0 to 1. A choice (or a yes/no sending 0 or 1023) less sure than this doesn't change its outlet, so outputs don't flicker on unclear text. 0.5 held back almost every wrong answer in testing. Yes/no probabilities and scores always update."><br>
            <input type="checkbox" rv-checked="widget:gate" title="When the first question is a choice and it answers none, the other outlets keep their values - so off-topic talk doesn't move a yes/no or a score"> hold the others when the first answers none<br>
            <input type="checkbox" rv-checked="widget:autoDecide" title="Decide whenever the text changes, once it has been still for the pause below. Off: only the decide button."> decide when the text changes<br>
            <label>pause (ms)</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:pause" title="How long the text must stay unchanged before deciding, so a sentence still arriving word by word isn't decided on every word"><br>
            <input type="checkbox" rv-checked="widget:binary" title="Off: a yes/no outlet sends how likely yes is, 0-1023. On: 1023 for yes, 0 for no."> yes/no outlets send 0 or 1023
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/decide/" target="_blank">Widget help</a>
        </div>
    </div>
</div>
