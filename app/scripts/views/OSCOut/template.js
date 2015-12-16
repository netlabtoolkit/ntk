<div class="widgetAuthoring">
    <div class="widgetTop typeNetwork">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="dialwrapper" style="position:relative;">
            <div class="display invalue" rv-text="widget:in | twodecimals">100</div>
            <div class="display outvalue" rv-text="widget:out | twodecimals">1023</div>
            <div style="position:relative;"><input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/></div>
        </div>
    </div>

    <div class="widgetRight">
        <div class=rightTab><input type="checkbox" rv-checked="widget:activeOut" /></div>
    </div>
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label for="messageName">message</label> <input name="messageName" type="text" rv-value="widget:messageName"><br>
            <label for="server">server</label> <input name="server" type="text" rv-value="widget:server"><br>
            <label for="port">port</label> <input name="port" type="text" rv-value="widget:port">
				</div>
    </div>

</div>
