<div class="widgetAuthoring">
    <div class="widgetTop typeLogic">
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
            <div class="inletValue"><span rv-text="widget:in | rounded">0</span></div>
        </div>
        <div class="widgetBodyRight">
            <div class="outletValue"><input class="outputParam" type="text" pattern="[0-9]*" rv-value="widget:outACenter | rounded">
                <span class="" rv-text="widget:out1">0</span></div>
            <div class="outletValue"><input class="outputParam" type="text" pattern="[0-9]*" rv-value="widget:outBCenter | rounded">
                <span class="" rv-text="widget:out2">0</span></div>
            <div class="outletValue"><input class="outputParam" type="text" pattern="[0-9]*" rv-value="widget:outCCenter | rounded">
                <span class="" rv-text="widget:out3">0</span></div>
            <div class="outletValue"><input class="outputParam" type="text" pattern="[0-9]*" rv-value="widget:outDCenter | rounded">
                <span class="" rv-text="widget:out4">0</span></div>
        </div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label for="width">range</label>
            <input class="width" class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:outWidth"><br>
            <label for="min">min</label>
            <input class="min" class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:outMin"><br>
            <label for="max">max</label>
            <input class="max" class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:outMax">
        </div>
    </div>
</div>