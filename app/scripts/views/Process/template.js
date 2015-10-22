<div class="widgetAuthoring">
    <div class="widgetTop typeLogic">
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
        <div class="dialwrapper" style="position:relative;">
            <div class="display invalue" rv-text="widget:in | rounded">100</div>
            <div class="display outvalue" rv-text="widget:out | rounded">1023</div>
            <div style="position:relative;"><input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/></div>
        </div>

        <table class="rangeTable" border="0" cellspacing="3" cellpadding="0">
          <tr>
            <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputFloor"></td>
            <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputCeiling"></td>
          </tr>
        </table>

        <div class="options">
              <ul class="menu">
                <li title="invert" class='invert' rv-class-active="widget:invert">inv</li>
                <li title="smoothing" class="smoothing" rv-class-active="widget:smoothing">smo</li>
                <li title="easing" class="easing" rv-class-active="widget:easing">eas</li>
              </ul>
        </div>
    </div>
    <div class="widgetRight">
            <!-- <div class="outlet" draggable="true"></div> -->
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to"><div class="dot">&middot;</div></div>
        </div>
    </div>
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            input range<br>
            <label class="narrowLabel">min</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:inputFloor">
            <label class="narrowLabel">max</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:inputCeiling"><br>
            <label class="narrowLabel">ease</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:easingAmount"><br>
            <label class="narrowLabel">smooth</label> <input class='smoothingAmount moreParam' type="text" pattern="[0-9]*" rv-value="widget:smoothingAmount">
        </div>
    </div>
</div>
