<!-- "typeLogic" below sets this widget's on-canvas header color (see the
     .typeXXX classes in app/styles/Widget.scss) - it's separate from the
     categories array in Blank.js, which only controls Add Widgets panel
     grouping. Change this class to whichever .typeXXX matches the
     category you pick there, or add a new one, so the two stay in sync. -->
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
        <div class="dialwrapper" style="position:relative;">
            <div class="display invalue" rv-text="widget:in | rounded">100</div>
            <div class="display outvalue" rv-text="widget:out | rounded">1023</div>
            <div style="position:relative;"><input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/></div>
        </div>
        Limit <input type="checkbox" rv-checked="widget:limit" /> 
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <!-- "more" panel: a tab + hidden content area, toggled open by the
         user clicking the tab (WidgetView's base onRender wires that up -
         no extra JS needed here). Put configuration/tuning fields that
         aren't needed every time here instead of widening widgetBody
         above - see CLAUDE.md's widget design principles. -->
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label class="narrowLabel">ceiling</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:limitCeiling">
        </div>
    </div>
</div>