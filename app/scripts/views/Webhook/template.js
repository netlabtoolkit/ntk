<div class="widgetAuthoring">
    <div class="widgetTop typeNetwork">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="widgetBodyLeft">
            <div class="inletValue"><span rv-text="widget:trigger | rounded">0</span> <span rv-text="widget:displayText"></span></div>
            <div class="inletValue"><span rv-text="widget:in1 | rounded">0</span> &lt;1&gt;</div>
            <div class="inletValue"><span rv-text="widget:in2 | rounded">0</span> &lt;2&gt;</div>
            <div class="inletValue"><span rv-text="widget:in3 | rounded">0</span> &lt;3&gt;</div>
        </div>
    </div>

    <div class="widgetRight">
        <div class=rightTab><input class="sendToCloud" type="checkbox" rv-checked="widget:sendToCloud" /></div>
    </div>


    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label for="send">min time</label> <input class="moreParam" name="send" type="text" rv-value="widget:minPeriod"><br>
            <hr>
            Webhook: input url with &lt;1&gt;, &lt;2&gt;, or &lt;3&gt; for those inputs<br>
            <label>template</label> <input class="url" type="text" placeholder="https://zapier.com/hooks/catch/--/?temp=<1>" rv-value="widget:urlTemplate"><br>
            <label>output</label> <span rv-text="widget:urlComputed">
                
        </div>
    </div>
</div>