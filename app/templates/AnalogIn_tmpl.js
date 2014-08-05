<div class="title dragHandle">
	{widget:title} <label><input type="checkbox" rv-checked="widget:active" > Live</label>
</div>



<div class="dialwrapper" style="position:relative;">
<input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/>
<div class="display invalue" rv-text="widget:in">100</div>
<div class="display outvalue" rv-text="widget:out">1023</div>
</div>
<div width-100%>
<table width="100%" border="0" cellspacing="3" cellpadding="0">
  <tr>
    <th width="6%" scope="col">&nbsp;</th>
    <th width="44%" scope="col">low</th>
    <th width="44%" scope="col">high</th>
    <th width="6%" scope="col">&nbsp;</th>
  </tr>
  <tr>
    <th scope="row">i</th>
    <td><input style="width: 80%;" type="text" name="floor" rv-value="widget:inputFloor"></td>
    <td><input style="width: 80%;" type="text" name="ceiling" rv-value="widget:inputCeiling"></td>
    <td>&nbsp;</td>
  </tr>
  <tr>
    <th scope="row">o</th>
    <td><input style="width: 80%;" type="text" name="min" rv-value="widget:outputFloor"></td>
    <td><input style="width: 80%;" type="text" name="max" rv-value="widget:outputCeiling"></td>
    <td>&nbsp;</td>
  </tr>
</table>
</div>
<div class="options">
      <ul id="menu">
        <li class='invert' rv-class-active="widget:invert">inv</li>
        <li><a href="#">smo</a></li>
        <li><a href="#">eas</a></li>
      </ul>
</div>

<!-- <div class="outlet" draggable="true"></div> -->
<div class='outlets'>
    <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to">&middot;</div>
</div>

