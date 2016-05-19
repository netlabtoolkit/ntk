<div class="widgetAuthoring">
    <div class="widgetTop typeNetwork">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class=leftTab>
			<input type="checkbox" rv-checked="widget:active" />
		</div>
    </div>

    <div class="widgetBody">
        <div class="dialwrapper" style="position:relative;">
            <input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/>
            <div class="display invalue" rv-text="widget:in | twodecimals">0</div>
            <div class="display outvalue" rv-text="widget:out | twodecimals">180</div>
        </div>

        <table class="rangeTable" border="0" cellspacing="3" cellpadding="0">
          <tr>
            <td>in <input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:inputFloor"></td>
            <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:inputCeiling"></td>
          </tr>
          <tr>
            <td>out <input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputFloor"></td>
            <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputCeiling"></td>
          </tr>
        </table>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to"><div class="dot">&middot;</div></div>
        </div>
    </div>
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            Receiving on port: <strong>57190</strong><br>
            <label for="messageName">message</label> <input name="messageName" type="text" rv-value="widget:messageName">
		</div>
    </div>
</div>
